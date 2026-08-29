// ack-booking-delivery
//
// Worker App calls this from booking lifecycle moments:
//   - push_received: FCM payload arrived on device
//   - popup_shown:   booking popup actually rendered on screen
//   - worker_seen:   worker visibly opened/saw the booking card
//
// Failure events (recorded into failure_reason):
//   - popup_failed | permission_missing | overlay_blocked | app_killed | token_invalid
//
// Auth: dual-mode. Preferred: anon apikey + explicit worker_id (read from the
// device's local prefs). This works in background / killed-app state where the
// Supabase user JWT is often expired. Fallback: user JWT (legacy web call).
//
// Source of truth = booking_requests. Each timestamp event is idempotent.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://paywwbuqycovjopryele.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
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

type TimestampEvent = "push_received" | "popup_shown" | "worker_seen";
type FailureEvent =
  | "popup_failed"
  | "permission_missing"
  | "overlay_blocked"
  | "app_killed"
  | "token_invalid"
  // New (v6.0.67+): previously-silent abort paths between push_received and popup_shown
  | "prealert_suppressed"   // scheduled offer hidden by the client-side prealert guard
  | "session_missing"       // overlay/activity aborted: no usable session on device
  | "service_start_blocked"; // OS refused the background service/activity start
type EventType = TimestampEvent | FailureEvent;

const TS_COL: Record<TimestampEvent, "push_delivered_at" | "popup_shown_at" | "worker_seen_at"> = {
  push_received: "push_delivered_at",
  popup_shown: "popup_shown_at",
  worker_seen: "worker_seen_at",
};
const TS_CHANNEL: Record<TimestampEvent, string> = {
  push_received: "push",
  popup_shown: "popup",
  worker_seen: "popup",
};
const FAILURE_EVENTS = new Set<FailureEvent>([
  "popup_failed", "permission_missing", "overlay_blocked", "app_killed", "token_invalid",
  "prealert_suppressed", "session_missing", "service_start_blocked",
]);

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as {
      booking_id?: string;
      booking_request_id?: string;
      worker_id?: string;          // workers.user_id (Firebase UID / text)
      event_type?: EventType;
      app_version?: string;
      device_info?: Record<string, unknown>;
    };
    const { booking_id, booking_request_id, worker_id, event_type, app_version, device_info } = body;

    if (!event_type) return json({ error: "missing_event_type" }, 400);
    const isFailure = FAILURE_EVENTS.has(event_type as FailureEvent);
    const isTimestamp = (event_type as TimestampEvent) in TS_COL;
    if (!isFailure && !isTimestamp) {
      return json({ error: "invalid_event_type", got: event_type }, 400);
    }
    if (booking_id && !uuidRe.test(booking_id)) return json({ error: "bad booking_id" }, 400);
    if (booking_request_id && !uuidRe.test(booking_request_id)) return json({ error: "bad booking_request_id" }, 400);
    if (!booking_id && !booking_request_id) return json({ error: "booking_id_or_request_id_required" }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Resolve worker — prefer body-supplied worker_id (device prefs path).
    //    Falls back to JWT resolution (legacy web path) only if not supplied.
    let resolvedWorkerRowId: string | null = null;
    let resolvedVia: "device_worker_id" | "jwt" | null = null;

    if (worker_id) {
      const { data: w } = await admin
        .from("workers")
        .select("id, user_id")
        .or(`user_id.eq.${worker_id},id.eq.${worker_id}`)
        .maybeSingle();
      if (w?.id) { resolvedWorkerRowId = w.id; resolvedVia = "device_worker_id"; }
    }

    if (!resolvedWorkerRowId) {
      try {
        const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: userData } = await userClient.auth.getUser();
        const authUid = userData?.user?.id;
        if (authUid) {
          const { data: w } = await admin
            .from("workers")
            .select("id, user_id")
            .eq("user_id", authUid)
            .maybeSingle();
          if (w?.id) { resolvedWorkerRowId = w.id; resolvedVia = "jwt"; }
        }
      } catch (_) { /* ignore — fall through */ }
    }

    if (!resolvedWorkerRowId) {
      console.warn("[ack] worker_unresolved", { worker_id, booking_id, booking_request_id, event_type });
      return json({ error: "worker_unresolved" }, 403);
    }

    // 2. Look up booking_request
    let q = admin
      .from("booking_requests")
      .select("id, booking_id, worker_id, push_delivered_at, popup_shown_at, worker_seen_at, failure_reason")
      .eq("worker_id", resolvedWorkerRowId);
    q = booking_request_id ? q.eq("id", booking_request_id)
                           : q.eq("booking_id", booking_id!).order("created_at", { ascending: false }).limit(1);
    const { data: rows, error: rErr } = await q;
    if (rErr) return json({ error: "lookup_failed", detail: rErr.message }, 500);
    const reqRow = rows?.[0];
    if (!reqRow) {
      console.warn("[ack] request_not_found", { booking_id, booking_request_id, worker: resolvedWorkerRowId, event_type });
      return json({ ok: true, skipped: true, reason: "request_not_found", event_type });
    }

    const nowIso = new Date().toISOString();
    const updates: Record<string, unknown> = {};

    if (isFailure) {
      // Only set failure_reason the first time so the original cause wins.
      if (!reqRow.failure_reason) {
        updates.failure_reason = event_type;
        updates.failure_reported_at = nowIso;
      }
    } else {
      const col = TS_COL[event_type as TimestampEvent];
      const channel = TS_CHANNEL[event_type as TimestampEvent];
      if ((reqRow as any)[col]) {
        // already stamped — idempotent
        if (app_version) updates.device_app_version = app_version;
        if (device_info) updates.device_info = device_info;
        if (Object.keys(updates).length === 0) {
          return json({ ok: true, idempotent: true, event_type, resolved_via: resolvedVia });
        }
      } else {
        updates[col] = nowIso;
        updates.last_alert_channel = channel;
        if (event_type === "push_received") {
          updates.device_received_at = nowIso;
          updates.device_ack_status = "received";
        }
        if (event_type === "worker_seen") {
          updates.device_opened_at = nowIso;
          updates.device_ack_status = "opened";
        }
      }
    }

    if (app_version) updates.device_app_version = app_version;
    if (device_info) updates.device_info = device_info;

    if (Object.keys(updates).length === 0) {
      return json({ ok: true, noop: true, event_type, resolved_via: resolvedVia });
    }

    const { error: upErr } = await admin
      .from("booking_requests")
      .update(updates)
      .eq("id", reqRow.id);
    if (upErr) return json({ error: "update_failed", detail: upErr.message }, 500);

    // Notification health recovery: a successful push_received proves the
    // device is reachable again — decrement no_ack_count and mark health 'good'.
    if (event_type === "push_received") {
      try {
        const { data: w } = await admin
          .from("workers")
          .select("no_ack_count, notification_health, fcm_token_status")
          .eq("id", resolvedWorkerRowId)
          .maybeSingle();
        if (w) {
          const prevCount = w.no_ack_count ?? 0;
          const nextCount = Math.max(0, prevCount - 1);
          const healthImproved = w.notification_health !== "good" && prevCount > 0;
          const patch: Record<string, unknown> = {
            last_notification_received_at: nowIso,
          };
          if (nextCount !== prevCount) patch.no_ack_count = nextCount;
          if (healthImproved) {
            patch.notification_health = "good";
            patch.notification_health_updated_at = nowIso;
          }
          if (w.fcm_token_status === "invalid") {
            patch.fcm_token_status = "active";
          }
          if (Object.keys(patch).length > 0) {
            await admin.from("workers").update(patch).eq("id", resolvedWorkerRowId);
          }
          if (healthImproved || w.fcm_token_status === "invalid") {
            await admin.from("token_repair_events").insert({
              worker_id: resolvedWorkerRowId,
              event_type: w.fcm_token_status === "invalid" ? "invalid_recovered" : "ack_recovered",
              previous_status: w.fcm_token_status,
              new_status: "active",
              source: "ack",
              detail: { prev_no_ack_count: prevCount, next_no_ack_count: nextCount },
            });
          }
        }
      } catch (e) {
        console.warn("[ack] health_recovery_failed", e);
      }
    }

    console.log("[ack] ok", { event_type, booking_request_id: reqRow.id, resolved_via: resolvedVia });
    return json({
      ok: true,
      event_type,
      booking_request_id: reqRow.id,
      booking_id: reqRow.booking_id,
      resolved_via: resolvedVia,
      failure: isFailure,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[ack] fatal", msg);
    return json({ error: "fatal", detail: msg }, 500);
  }
});
