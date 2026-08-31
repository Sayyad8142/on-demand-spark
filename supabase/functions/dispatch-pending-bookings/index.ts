// dispatch-pending-bookings
//
// Cron-driven retry engine. Runs every 60 seconds.
//
// Responsibilities:
//   1. Mark booking_requests as `timed_out` when their timeout_at has passed
//      and they were never accepted.
//   2. For any booking still status='pending' with no active worker request,
//      re-invoke booking-notifications to dispatch the next batch
//      (up to MAX_DISPATCH_ATTEMPTS booking-level retries).
//   3. Idempotent: never duplicates an active request to the same worker.
//
// Auth: this function should be invoked by pg_cron with the service role
// header (or by an admin curl). verify_jwt = false in supabase/config.toml.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://paywwbuqycovjopryele.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Tunables (matched to the user-confirmed timing: 60s cron / 45s ACK / 3 batches)
const MAX_DISPATCH_ATTEMPTS = 3;
const ACK_TIMEOUT_SECONDS = 45;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const startedAt = new Date();
    const nowIso = startedAt.toISOString();

    // ── 1. Sweep expired requests ───────────────────────────────────────
    const { data: expired, error: expErr } = await admin
      .from("booking_requests")
      .update({
        status: "timed_out",
        responded_at: nowIso,
        alert_last_error: "timeout_no_ack",
      })
      .in("status", ["pending", "sent", "queued"])
      .lt("timeout_at", nowIso)
      .select("id, booking_id, worker_id");

    if (expErr) console.error("[dispatch] expire sweep failed:", expErr.message);
    const expiredCount = expired?.length ?? 0;

    // Phase 2: per-worker cooldown after a delivery failure. Increments
    // consecutive_delivery_failures and applies a 10-minute dispatch cooldown
    // so the dispatcher stops hammering unreachable workers.
    const failedWorkerIds = Array.from(new Set((expired ?? []).map((r) => r.worker_id).filter(Boolean)));
    if (failedWorkerIds.length) {
      const cooldownUntil = new Date(Date.now() + 10 * 60_000).toISOString();
      for (const wid of failedWorkerIds) {
        await admin.rpc("increment_worker_failure", { _worker_id: wid, _cooldown_until: cooldownUntil })
          .catch(async () => {
            // Fallback: direct update if RPC absent.
            const { data: w } = await admin
              .from("workers")
              .select("consecutive_delivery_failures")
              .eq("id", wid)
              .maybeSingle();
            const next = (w?.consecutive_delivery_failures ?? 0) + 1;
            await admin
              .from("workers")
              .update({
                consecutive_delivery_failures: next,
                dispatch_cooldown_until: cooldownUntil,
              })
              .eq("id", wid);
          });
      }
      await admin.from("notification_delivery_events").insert(
        failedWorkerIds.map((wid) => ({
          worker_id: wid,
          event_type: "delivery_failed",
          payload: { reason: "timeout_no_ack" },
        })),
      );
      console.log(JSON.stringify({ evt: "cooldown_applied", workers: failedWorkerIds.length }));
    }

    // ── 2. Find bookings still pending with no active request ───────────
    // Instant bookings: retry only while fresh (created in last 30 minutes).
    // Scheduled bookings are created HOURS in advance, so created_at is the
    // wrong clock for them — they must be retried around their dispatch
    // window (10 min before start until 60 min after start). Without this,
    // a scheduled booking only ever got its single pre-alert wave and was
    // never re-offered when workers failed to ACK.
    const cutoff = new Date(startedAt.getTime() - 30 * 60_000).toISOString();

    const { data: freshBookings, error: pbErr } = await admin
      .from("bookings")
      .select("id, status, created_at, service_type, booking_type, scheduled_date, scheduled_time, prealert_sent")
      .eq("status", "pending")
      .gte("created_at", cutoff)
      .limit(50);

    // Scheduled bookings inside their dispatch window (IST date/time columns).
    const istNow = new Date(startedAt.getTime() + 5.5 * 60 * 60_000);
    const istToday = istNow.toISOString().slice(0, 10);
    const istYesterday = new Date(istNow.getTime() - 24 * 60 * 60_000).toISOString().slice(0, 10);

    const { data: scheduledCandidates } = await admin
      .from("bookings")
      .select("id, status, created_at, service_type, booking_type, scheduled_date, scheduled_time, prealert_sent")
      .eq("status", "pending")
      .eq("prealert_sent", true)
      .in("scheduled_date", [istYesterday, istToday])
      .limit(100);

    const inDispatchWindow = (b: any) => {
      if (!b.scheduled_date || !b.scheduled_time) return false;
      const [y, m, d] = String(b.scheduled_date).split("-").map(Number);
      const [hh, mm, ss] = String(b.scheduled_time).split(":").map(Number);
      const startUtcMs = Date.UTC(y, m - 1, d, hh, mm, ss || 0) - 5.5 * 60 * 60_000;
      const minutesFromStart = (startedAt.getTime() - startUtcMs) / 60_000;
      return minutesFromStart >= -10 && minutesFromStart <= 60;
    };

    const byId = new Map<string, any>();
    for (const b of freshBookings ?? []) byId.set(b.id, b);
    for (const b of scheduledCandidates ?? []) {
      if (inDispatchWindow(b)) byId.set(b.id, b);
    }
    const pendingBookings = Array.from(byId.values());

    if (pbErr) {
      console.error("[dispatch] pending bookings lookup failed:", pbErr.message);
      return json({ error: "lookup_failed", detail: pbErr.message }, 500);
    }


    let retried = 0;
    let skippedActive = 0;
    let skippedMaxed = 0;

    for (const b of pendingBookings ?? []) {
      // Are there any still-active requests for this booking?
      const { count: activeCount } = await admin
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("booking_id", b.id)
        .in("status", ["pending", "sent", "queued"])
        .gt("timeout_at", nowIso);

      if ((activeCount ?? 0) > 0) {
        skippedActive++;
        continue;
      }

      // Count total dispatch batches we've tried (= distinct order_sequence groupings)
      // Simpler proxy: total request rows for this booking. If we've already
      // hit the cap, give up and stop spamming.
      const { count: totalRequests } = await admin
        .from("booking_requests")
        .select("id", { count: "exact", head: true })
        .eq("booking_id", b.id);

      // Each batch creates ~5–10 requests; treat MAX_DISPATCH_ATTEMPTS as
      // tier escalation rounds. Use a conservative ceiling:
      const requestCap = MAX_DISPATCH_ATTEMPTS * 15;
      if ((totalRequests ?? 0) >= requestCap) {
        skippedMaxed++;
        continue;
      }

      // Re-invoke booking-notifications to fire the next eligible batch.
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/booking-notifications`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ booking_id: b.id }),
        });
        const text = await resp.text();
        if (!resp.ok) {
          console.warn(`[dispatch] retry failed for ${b.id}: ${resp.status} ${text}`);
        } else {
          retried++;
        }
      } catch (err) {
        console.error(`[dispatch] retry threw for ${b.id}:`, err);
      }
    }

    const summary = {
      ok: true,
      ran_at: nowIso,
      duration_ms: Date.now() - startedAt.getTime(),
      expired_swept: expiredCount,
      pending_bookings_inspected: pendingBookings?.length ?? 0,
      retried,
      skipped_already_active: skippedActive,
      skipped_max_attempts: skippedMaxed,
      ack_timeout_seconds: ACK_TIMEOUT_SECONDS,
      max_dispatch_attempts: MAX_DISPATCH_ATTEMPTS,
    };
    console.log("[dispatch] summary", summary);
    return json(summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[dispatch-pending-bookings] fatal", msg);
    return json({ error: "fatal", detail: msg }, 500);
  }
});
