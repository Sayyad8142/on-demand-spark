// worker-health-watchdog
//
// Runs on a schedule (pg_cron every 2 min). For every worker currently marked
// available for dispatch, verify their device is actually healthy:
//   - recent heartbeat  (last_seen_at within HEARTBEAT_STALE_MIN minutes)
//   - fcm token present + status != 'invalid'
//   - notification_health != 'critical'
//   - no fresh missed-booking / ack-timeout signals within RECENT_MISS_MIN minutes
//
// Unhealthy → set is_available=false, stamp auto_paused_at + auto_paused_reason,
// and send a data-only FCM to the worker with type=WORKER_PAUSED so the app
// surfaces the exact reason.
//
// Previously auto-paused workers that are now healthy → clear auto_paused_at
// and set is_available=true (only if the pause was ours — auto_paused_source
// = 'watchdog').

import { createClient } from "npm:@supabase/supabase-js@2.50.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HEARTBEAT_STALE_MIN = 5;
const RECENT_MISS_MIN = 10;
const RECENT_MISS_THRESHOLD = 3; // ≥3 diagnostics in window → unhealthy

type Reason =
  | "heartbeat_stale"
  | "no_fcm_token"
  | "fcm_token_invalid"
  | "notification_health_critical"
  | "repeated_missed_bookings";

interface WorkerRow {
  id: string;
  user_id: string | null;
  is_available: boolean | null;
  last_seen_at: string | null;
  last_active_at: string | null;
  fcm_token: string | null;
  fcm_token_status: string | null;
  notification_health: string | null;
  auto_paused_at: string | null;
  auto_paused_source: string | null;
}

function evaluate(worker: WorkerRow, recentMissCount: number): Reason | null {
  const lastBeat = worker.last_seen_at || worker.last_active_at;
  if (!lastBeat) return "heartbeat_stale";
  const ageMin = (Date.now() - Date.parse(lastBeat)) / 60_000;
  if (ageMin > HEARTBEAT_STALE_MIN) return "heartbeat_stale";
  if (!worker.fcm_token) return "no_fcm_token";
  if (worker.fcm_token_status === "invalid") return "fcm_token_invalid";
  if (worker.notification_health === "critical") return "notification_health_critical";
  if (recentMissCount >= RECENT_MISS_THRESHOLD) return "repeated_missed_bookings";
  return null;
}

function reasonMessage(reason: Reason): { title: string; body: string } {
  switch (reason) {
    case "heartbeat_stale":
      return {
        title: "Bookings paused",
        body: "We haven't heard from your app for a few minutes. Open the app to resume.",
      };
    case "no_fcm_token":
    case "fcm_token_invalid":
      return {
        title: "Bookings paused",
        body: "Booking alerts aren't registered. Open the app to refresh.",
      };
    case "notification_health_critical":
      return {
        title: "Bookings paused",
        body: "Recent booking alerts didn't reach you. Check notification settings.",
      };
    case "repeated_missed_bookings":
      return {
        title: "Bookings paused",
        body: "Several booking alerts didn't reach your device. Please open the app.",
      };
  }
}

async function notifyWorker(
  supabase: any,
  worker: WorkerRow,
  reason: Reason,
) {
  if (!worker.fcm_token) return;
  const { title, body } = reasonMessage(reason);
  try {
    await supabase.functions.invoke("send-fcm", {
      body: {
        token: worker.fcm_token,
        data: {
          type: "WORKER_PAUSED",
          reason,
          title,
          body,
        },
        notification: { title, body },
      },
    });
  } catch (e) {
    console.warn("[watchdog] notify failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startedAt = Date.now();
  const summary = {
    scanned: 0,
    paused: 0,
    restored: 0,
    errors: 0,
    paused_reasons: {} as Record<string, number>,
  };

  try {
    // 1) All currently-available workers → verify.
    const { data: availableWorkers, error: availErr } = await supabase
      .from("workers")
      .select(
        "id, user_id, is_available, last_seen_at, last_active_at, fcm_token, fcm_token_status, notification_health, auto_paused_at, auto_paused_source",
      )
      .eq("is_available", true);

    if (availErr) throw availErr;
    summary.scanned += availableWorkers?.length ?? 0;

    const missWindow = new Date(Date.now() - RECENT_MISS_MIN * 60_000).toISOString();

    for (const w of (availableWorkers ?? []) as WorkerRow[]) {
      try {
        // Count recent diagnostics
        const { count } = await supabase
          .from("worker_missed_booking_diagnostics")
          .select("id", { count: "exact", head: true })
          .eq("worker_id", w.id)
          .gte("created_at", missWindow);
        const recentMissCount = count ?? 0;

        const reason = evaluate(w, recentMissCount);
        if (!reason) continue;

        const nowIso = new Date().toISOString();
        const { error: upErr } = await supabase
          .from("workers")
          .update({
            is_available: false,
            auto_paused_at: nowIso,
            auto_paused_reason: reason,
            auto_paused_source: "watchdog",
            auto_pause_notified_at: nowIso,
          })
          .eq("id", w.id);
        if (upErr) throw upErr;

        summary.paused += 1;
        summary.paused_reasons[reason] = (summary.paused_reasons[reason] ?? 0) + 1;
        console.log(`[watchdog] paused worker=${w.id} reason=${reason} recent_miss=${recentMissCount}`);

        await notifyWorker(supabase, w, reason);
      } catch (e) {
        summary.errors += 1;
        console.error("[watchdog] pause failed", w.id, e);
      }
    }

    // 2) Previously auto-paused workers → restore if healthy again.
    const { data: pausedWorkers, error: pausedErr } = await supabase
      .from("workers")
      .select(
        "id, user_id, is_available, last_seen_at, last_active_at, fcm_token, fcm_token_status, notification_health, auto_paused_at, auto_paused_source",
      )
      .eq("auto_paused_source", "watchdog")
      .not("auto_paused_at", "is", null);

    if (pausedErr) throw pausedErr;

    for (const w of (pausedWorkers ?? []) as WorkerRow[]) {
      try {
        const { count } = await supabase
          .from("worker_missed_booking_diagnostics")
          .select("id", { count: "exact", head: true })
          .eq("worker_id", w.id)
          .gte("created_at", missWindow);
        const recentMissCount = count ?? 0;

        const reason = evaluate(w, recentMissCount);
        if (reason) continue; // still unhealthy — leave paused

        const nowIso = new Date().toISOString();
        const { error: upErr } = await supabase
          .from("workers")
          .update({
            is_available: true,
            auto_paused_at: null,
            auto_paused_reason: null,
            auto_paused_source: null,
            auto_paused_restored_at: nowIso,
          })
          .eq("id", w.id);
        if (upErr) throw upErr;

        summary.restored += 1;
        console.log(`[watchdog] restored worker=${w.id}`);
      } catch (e) {
        summary.errors += 1;
        console.error("[watchdog] restore failed", w.id, e);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        summary,
        duration_ms: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[watchdog] fatal", e);
    return new Response(
      JSON.stringify({ error: String(e), summary }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
