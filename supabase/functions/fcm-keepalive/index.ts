// fcm-keepalive (smart / lightweight)
//
// Phase 2.1 — adaptive reachability prober.
// Strategy:
//   • Cron runs every 60 min (configurable via KEEPALIVE_MIN_INTERVAL_MINUTES).
//   • Only pings workers whose ALL primary reachability signals are stale
//     (no recent FCM, no heartbeat, no keepalive ack).
//   • Hard batch cap (KEEPALIVE_MAX_BATCH, default 150).
//   • Skips workers in dispatch_cooldown_until.
//   • Only writes the worker row when state actually changed.
//   • Only writes a delivery_event row on failure paths.
//   • Adaptive cadence: workers with consecutive_delivery_failures >=3 are
//     parked (skipped) for a longer back-off window.
//   • Globally disable via KEEPALIVE_ENABLED=false.

import { createClient } from "npm:@supabase/supabase-js@2.50.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// HARD KILL SWITCH — paused due to Supabase Disk IO budget warning.
// Keepalive is disabled by default; native app boot/FCM recovery still works.
// To re-enable later, set KEEPALIVE_ENABLED=true in edge function secrets.
const KEEPALIVE_ENABLED = (Deno.env.get("KEEPALIVE_ENABLED") ?? "false").toLowerCase() === "true";
const MIN_INTERVAL_MIN = Number(Deno.env.get("KEEPALIVE_MIN_INTERVAL_MINUTES") ?? "60");
const MAX_BATCH = Math.min(Number(Deno.env.get("KEEPALIVE_MAX_BATCH") ?? "150"), 500);
const STALE_MIN = 45; // primary signals considered stale after 45 min
const BACKOFF_MIN = 180; // parked workers wait 3h between probes

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!KEEPALIVE_ENABLED) {
    return json({ ok: true, skipped: "disabled" });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date();
    const minIntervalIso = new Date(now.getTime() - MIN_INTERVAL_MIN * 60_000).toISOString();
    const staleIso = new Date(now.getTime() - STALE_MIN * 60_000).toISOString();
    const backoffIso = new Date(now.getTime() - BACKOFF_MIN * 60_000).toISOString();
    const nowIso = now.toISOString();

    // Only candidates that:
    //  - are available
    //  - have a non-invalid token
    //  - are not in dispatch cooldown
    //  - haven't been pinged within MIN_INTERVAL
    //  - parked (>=3 failures) workers respect the longer BACKOFF window
    //  - all 3 primary reachability signals are stale (true unreachable suspicion)
    const { data: candidates, error } = await supabase
      .from("workers")
      .select(
        "id, consecutive_delivery_failures, last_keepalive_sent_at, last_keepalive_ack_at, last_notification_received_at, last_active_at, dispatch_cooldown_until, fcm_token_status",
      )
      .eq("is_available", true)
      .eq("is_active", true)
      .neq("is_blocked", true)
      .not("fcm_token", "is", null)
      .neq("fcm_token_status", "invalid")
      .or(`dispatch_cooldown_until.is.null,dispatch_cooldown_until.lt.${nowIso}`)
      .or(`last_keepalive_sent_at.is.null,last_keepalive_sent_at.lt.${minIntervalIso}`)
      .or(`last_notification_received_at.is.null,last_notification_received_at.lt.${staleIso}`)
      .or(`last_active_at.is.null,last_active_at.lt.${staleIso}`)
      .or(`last_keepalive_ack_at.is.null,last_keepalive_ack_at.lt.${staleIso}`)
      .limit(MAX_BATCH * 2); // over-fetch, then refine in code

    if (error) {
      console.error(JSON.stringify({ evt: "keepalive_lookup_failed", err: error.message }));
      return json({ error: error.message }, 500);
    }

    // Apply parked back-off and final cap in code (Postgrest can't easily express
    // the conditional BACKOFF rule alongside everything else).
    const eligible: string[] = [];
    for (const w of candidates ?? []) {
      const failures = w.consecutive_delivery_failures ?? 0;
      const lastSent = w.last_keepalive_sent_at ? new Date(w.last_keepalive_sent_at).getTime() : 0;
      if (failures >= 3 && lastSent > now.getTime() - BACKOFF_MIN * 60_000) {
        // parked — respect long back-off
        continue;
      }
      eligible.push(w.id);
      if (eligible.length >= MAX_BATCH) break;
    }

    if (!eligible.length) {
      return json({ ok: true, sent: 0, scanned: candidates?.length ?? 0 });
    }

    // Single bulk write to stamp last_keepalive_sent_at — cheap.
    await supabase.from("workers").update({ last_keepalive_sent_at: nowIso }).in("id", eligible);

    // Send silent data-only PING via send-fcm.
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-fcm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        workerIds: eligible,
        title: "",
        body: "",
        data: { type: "PING", ts: String(Date.now()) },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      // Failure → log a single event row (per batch) so DB writes stay minimal.
      await supabase.from("notification_delivery_events").insert({
        event_type: "keepalive_send_failed",
        payload: { status: resp.status, count: eligible.length, body: text.slice(0, 200) },
      });
      console.error(JSON.stringify({ evt: "keepalive_send_failed", status: resp.status }));
      return json({ ok: false, sent: 0, error: "send-fcm failed" }, 502);
    }

    // Success path — NO per-worker delivery_event rows. Worker app will write
    // its own keepalive_ack event when it receives the PING.
    console.log(
      JSON.stringify({
        evt: "keepalive_sent_batch",
        sent: eligible.length,
        scanned: candidates?.length ?? 0,
        interval_min: MIN_INTERVAL_MIN,
        max_batch: MAX_BATCH,
      }),
    );

    return json({
      ok: true,
      sent: eligible.length,
      scanned: candidates?.length ?? 0,
      interval_min: MIN_INTERVAL_MIN,
      max_batch: MAX_BATCH,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error(JSON.stringify({ evt: "keepalive_fatal", err: msg }));
    return json({ error: msg }, 500);
  }
});
