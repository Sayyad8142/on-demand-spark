// ack-booking-delivery
//
// Worker App calls this from 3 lifecycle moments:
//   - push_received: FCM payload arrived on device
//   - popup_shown:   booking popup actually rendered on screen
//   - worker_seen:   worker visibly opened/saw the booking card
//
// Source of truth = booking_requests table. Each event maps to one column.
// Idempotent: only fills the timestamp if it's still NULL.
//
// Auth: standard Supabase JWT (anon role) — we resolve the worker via
// workers.user_id = auth.uid() and require the booking_request row to belong
// to that worker. No service-role escalation needed.

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

type EventType = "push_received" | "popup_shown" | "worker_seen";

const EVENT_TO_COL: Record<EventType, "push_delivered_at" | "popup_shown_at" | "worker_seen_at"> = {
  push_received: "push_delivered_at",
  popup_shown: "popup_shown_at",
  worker_seen: "worker_seen_at",
};

const EVENT_TO_CHANNEL: Record<EventType, string> = {
  push_received: "push",
  popup_shown: "popup",
  worker_seen: "popup",
};

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { booking_id, booking_request_id, event_type } = body as {
      booking_id?: string;
      booking_request_id?: string;
      event_type?: EventType;
    };

    if (!event_type || !(event_type in EVENT_TO_COL)) {
      return json({ error: "invalid_event_type", allowed: Object.keys(EVENT_TO_COL) }, 400);
    }
    if (booking_id && !uuidRe.test(booking_id)) return json({ error: "bad booking_id" }, 400);
    if (booking_request_id && !uuidRe.test(booking_request_id)) return json({ error: "bad booking_request_id" }, 400);
    if (!booking_id && !booking_request_id) return json({ error: "booking_id_or_request_id_required" }, 400);

    // 1. Identify the calling worker via their Supabase JWT
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauth", detail: userErr?.message }, 401);
    const authUid = userData.user.id;

    // 2. Resolve worker row (workers.user_id is text → Firebase UID or Supabase UID)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: worker, error: wErr } = await admin
      .from("workers")
      .select("id, user_id")
      .eq("user_id", authUid)
      .maybeSingle();
    if (wErr || !worker) return json({ error: "worker_not_found" }, 403);

    // 3. Find the matching booking_request belonging to this worker.
    //    If booking_request_id supplied, prefer that. Otherwise grab the
    //    latest active request for (booking_id, worker_id).
    let query = admin
      .from("booking_requests")
      .select("id, booking_id, worker_id, status, push_delivered_at, popup_shown_at, worker_seen_at, alert_attempt_count")
      .eq("worker_id", worker.id);

    if (booking_request_id) query = query.eq("id", booking_request_id);
    else query = query.eq("booking_id", booking_id!).order("created_at", { ascending: false }).limit(1);

    const { data: rows, error: rErr } = await query;
    if (rErr) return json({ error: "lookup_failed", detail: rErr.message }, 500);
    const reqRow = rows?.[0];
    if (!reqRow) {
      console.warn("[ack-booking-delivery] request_not_found", {
        booking_id,
        booking_request_id,
        event_type,
        worker_id: worker.id,
      });
      return json({
        ok: true,
        skipped: true,
        reason: "request_not_found",
        booking_id,
        booking_request_id,
        event_type,
      });
    }

    const col = EVENT_TO_COL[event_type];
    const channel = EVENT_TO_CHANNEL[event_type];

    // Idempotent: only set the timestamp the first time
    const existing = (reqRow as any)[col];
    if (existing) {
      return json({ ok: true, idempotent: true, booking_request_id: reqRow.id, event_type });
    }

    const updates: Record<string, unknown> = {
      [col]: new Date().toISOString(),
      last_alert_channel: channel,
    };

    // Keep existing device_received_at / device_opened_at columns in sync for
    // backwards-compat with any code already reading them.
    if (event_type === "push_received") {
      updates.device_received_at = updates[col];
      updates.device_ack_status = "received";
    }
    if (event_type === "worker_seen") {
      updates.device_opened_at = updates[col];
      updates.device_ack_status = "opened";
    }

    const { error: upErr } = await admin
      .from("booking_requests")
      .update(updates)
      .eq("id", reqRow.id);

    if (upErr) return json({ error: "update_failed", detail: upErr.message }, 500);

    return json({ ok: true, booking_request_id: reqRow.id, booking_id: reqRow.booking_id, event_type });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[ack-booking-delivery] fatal", msg);
    return json({ error: "fatal", detail: msg }, 500);
  }
});
