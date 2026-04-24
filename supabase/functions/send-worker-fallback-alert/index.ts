// send-worker-fallback-alert  (STUB — logs only, no SMS sent yet)
//
// Intended trigger: dispatch-pending-bookings (or a future worker-side check)
// detects a booking_request that is still active and has had NO push_delivered_at
// for more than FALLBACK_THRESHOLD_SECONDS. We then call this function to
// send the worker an SMS or WhatsApp ping.
//
// Today this function is a stub: it validates the request, increments
// fallback_sms_count and stamps fallback_sms_sent_at, but does NOT actually
// hit Twilio/Gupshup. Wire up the real provider by filling in `sendSms()`.

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

const FALLBACK_THRESHOLD_SECONDS = 90;     // user-confirmed
const MAX_FALLBACK_PER_REQUEST = 1;        // never spam
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Replace this body with a real Twilio/Gupshup call when you choose a provider.
async function sendSms(_phone: string, _msg: string): Promise<{ ok: boolean; provider: string; detail?: string }> {
  console.log("[fallback-stub] would have sent SMS to", _phone, "msg:", _msg);
  return { ok: true, provider: "stub" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { booking_request_id } = body as { booking_request_id?: string };
    if (!booking_request_id || !uuidRe.test(booking_request_id)) {
      return json({ error: "bad booking_request_id" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: reqRow, error: rErr } = await admin
      .from("booking_requests")
      .select("id, booking_id, worker_id, status, push_sent_at, push_delivered_at, fallback_sms_count, fallback_sms_sent_at, timeout_at")
      .eq("id", booking_request_id)
      .maybeSingle();

    if (rErr) return json({ error: "lookup_failed", detail: rErr.message }, 500);
    if (!reqRow) return json({ error: "request_not_found" }, 404);

    if (!["pending", "sent", "queued"].includes(reqRow.status as string)) {
      return json({ skip: true, reason: "request_not_active", status: reqRow.status });
    }
    if (reqRow.push_delivered_at) {
      return json({ skip: true, reason: "push_already_acked" });
    }
    if ((reqRow.fallback_sms_count ?? 0) >= MAX_FALLBACK_PER_REQUEST) {
      return json({ skip: true, reason: "fallback_cap_reached", count: reqRow.fallback_sms_count });
    }

    // Threshold check
    if (reqRow.push_sent_at) {
      const ageMs = Date.now() - new Date(reqRow.push_sent_at).getTime();
      if (ageMs < FALLBACK_THRESHOLD_SECONDS * 1000) {
        return json({ skip: true, reason: "below_threshold", age_seconds: Math.floor(ageMs / 1000) });
      }
    }

    // Resolve worker phone + booking summary for the message body
    const { data: worker } = await admin
      .from("workers")
      .select("id, full_name, phone_number")
      .eq("id", reqRow.worker_id)
      .maybeSingle();
    const { data: booking } = await admin
      .from("bookings")
      .select("id, service_type, community, flat_no, price_inr")
      .eq("id", reqRow.booking_id)
      .maybeSingle();

    if (!worker?.phone_number) {
      return json({ skip: true, reason: "no_worker_phone" });
    }

    const msg = booking
      ? `Didi Now: New booking ${booking.service_type} at ${booking.flat_no ?? booking.community ?? ""} for ₹${booking.price_inr ?? "?"}. Open the app to accept.`
      : "Didi Now: You have a pending booking. Open the app to accept.";

    const sendResult = await sendSms(worker.phone_number, msg);

    const nowIso = new Date().toISOString();
    const { error: upErr } = await admin
      .from("booking_requests")
      .update({
        fallback_sms_sent_at: nowIso,
        fallback_sms_count: (reqRow.fallback_sms_count ?? 0) + 1,
        last_alert_channel: "sms",
        alert_last_error: sendResult.ok ? null : (sendResult.detail ?? "sms_send_failed"),
      })
      .eq("id", reqRow.id);

    if (upErr) return json({ error: "update_failed", detail: upErr.message }, 500);

    return json({
      ok: true,
      booking_request_id: reqRow.id,
      provider: sendResult.provider,
      stub: sendResult.provider === "stub",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[send-worker-fallback-alert] fatal", msg);
    return json({ error: "fatal", detail: msg }, 500);
  }
});
