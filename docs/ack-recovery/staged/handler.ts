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

// Pure handler: no runtime imports so it can be tested offline.
// Entry point (Deno.serve + real clients) lives in index.ts.


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
  | "service_start_blocked"  // OS refused the background service/activity start
  | "offer_queued_expired";  // offer waited in the device FIFO queue and expired before it could be shown
// Worker interactions (v10.0.02+). Logged to booking_offer_events only —
// they never change dispatch/assignment state (accept/reject RPCs stay authoritative).
type InteractionEvent = "accept_tapped" | "reject_tapped" | "offer_expired" | "offer_dismissed";
const INTERACTION_EVENTS = new Set<string>(["accept_tapped", "reject_tapped", "offer_expired", "offer_dismissed"]);
type EventType = TimestampEvent | FailureEvent | InteractionEvent;

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
  "offer_queued_expired",
]);

// Legacy aliases used by older Worker App builds (<= 6.0.64) and the very
// first ACK contract. Kept so no installed client is rejected with a 400.
const EVENT_ALIASES: Record<string, EventType> = {
  received: "push_received",
  push_delivered: "push_received",
  opened: "worker_seen",
  seen: "worker_seen",
  popup: "popup_shown",
};

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// deno-lint-ignore no-explicit-any
type Client = any;
export interface HandlerDeps {
  admin: () => Client;
  userClient: (authHeader: string) => Client;
}

// worker_id is interpolated into a PostgREST .or() filter. Only plain
// Firebase UIDs / UUIDs are allowed so ",", "(", ")" or "." cannot inject
// extra filter conditions and resolve to a different worker.
export const SAFE_WORKER_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const isSafeWorkerId = (v: unknown): v is string =>
  typeof v === "string" && SAFE_WORKER_ID.test(v);

export function makeHandler(deps: HandlerDeps) {
  return async (req: Request): Promise<Response> => {
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
      app_state?: string;
    };
    const { booking_id, booking_request_id, worker_id, app_version, device_info } = body;
    const app_state = typeof body.app_state === "string" ? body.app_state.slice(0, 40) : null;
    const rawEvent = body.event_type ?? (body as any).event;

    if (!rawEvent) return json({ error: "missing_event_type" }, 400);
    const event_type = (EVENT_ALIASES[rawEvent as string] ?? rawEvent) as EventType;
    const isFailure = FAILURE_EVENTS.has(event_type as FailureEvent);
    const isTimestamp = (event_type as TimestampEvent) in TS_COL;
    const isInteraction = INTERACTION_EVENTS.has(event_type);
    if (!isFailure && !isTimestamp && !isInteraction) {
      return json({ error: "invalid_event_type", got: rawEvent }, 400);
    }
    if (booking_id && !uuidRe.test(booking_id)) return json({ error: "bad booking_id" }, 400);
    if (booking_request_id && !uuidRe.test(booking_request_id)) return json({ error: "bad booking_request_id" }, 400);
    if (!booking_id && !booking_request_id) return json({ error: "booking_id_or_request_id_required" }, 400);

    if (worker_id !== undefined && worker_id !== null && !isSafeWorkerId(worker_id)) {
      return json({ error: "bad worker_id" }, 400);
    }
    if (booking_id !== undefined && typeof booking_id !== "string") return json({ error: "bad booking_id" }, 400);
    if (booking_request_id !== undefined && typeof booking_request_id !== "string") return json({ error: "bad booking_request_id" }, 400);

    const admin = deps.admin();

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
        const userClient = deps.userClient(authHeader);
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

    // Append-only lifecycle log, deduped by (booking_request_id, event_type).
    // Ownership: reqRow was looked up scoped to the resolved worker above.
    const { error: evErr } = await admin.from("booking_offer_events").upsert({
      booking_request_id: reqRow.id,
      booking_id: reqRow.booking_id,
      worker_id: resolvedWorkerRowId,
      event_type,
      source: "device",
      app_state,
      app_version: app_version ?? null,
      device_info: device_info ?? null,
      occurred_at: nowIso,
    }, { onConflict: "booking_request_id,event_type", ignoreDuplicates: true });
    if (evErr) console.warn("[ack] event_log_failed", evErr.message);

    if (isInteraction) {
      return json({ ok: !evErr, event_type, booking_request_id: reqRow.id, logged: !evErr }, evErr ? 500 : 200);
    }

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
  };
}
