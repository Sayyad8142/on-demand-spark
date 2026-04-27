// get-pending-worker-bookings
//
// Polling backup for the Worker App. Returns every active booking_request
// belonging to the caller (status pending/sent/queued, not yet timed out).
// The app uses this on app-open, on-resume, and on a 10s/30s loop while online.
//
// Auth: standard Supabase JWT — we resolve the worker via workers.user_id.
// Returns the same fields the app needs to render the same booking popup
// the FCM/realtime path renders.

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

const ACTIVE = ["pending", "sent", "queued"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauth" }, 401);
    const authUid = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: worker, error: wErr } = await admin
      .from("workers")
      .select("id")
      .eq("user_id", authUid)
      .maybeSingle();
    if (wErr || !worker) return json({ error: "worker_not_found" }, 403);

    const nowIso = new Date().toISOString();

    // Pull active requests for this worker that are still within their window
    const { data: requests, error: reqErr } = await admin
      .from("booking_requests")
      .select("id, booking_id, status, timeout_at, offered_at, popup_shown_at, worker_seen_at")
      .eq("worker_id", worker.id)
      .in("status", ACTIVE)
      .gt("timeout_at", nowIso)
      .order("offered_at", { ascending: false })
      .limit(5);

    if (reqErr) return json({ error: "lookup_failed", detail: reqErr.message }, 500);
    if (!requests || requests.length === 0) return json({ pending: [] });

    // Hydrate booking details and filter out any whose parent booking is no longer pending
    const bookingIds = Array.from(new Set(requests.map(r => r.booking_id)));
    const { data: bookings, error: bErr } = await admin
      .from("bookings")
      .select("id, status, service_type, community, cust_name, flat_no, price_inr, scheduled_date, scheduled_time, booking_type, prealert_sent, address_line1")
      .in("id", bookingIds);

    if (bErr) return json({ error: "booking_lookup_failed", detail: bErr.message }, 500);

    const bookingMap = new Map((bookings ?? []).map(b => [b.id, b]));

    const pending = requests
      .map(r => {
        const b = bookingMap.get(r.booking_id);
        if (!b || b.status !== "pending") return null;
        const isScheduled = b.booking_type === "scheduled" || !!(b.scheduled_date && b.scheduled_time);
        if (isScheduled && b.prealert_sent !== true) {
          console.log("[get-pending-worker-bookings] scheduled request hidden", {
            booking_id: b.id,
            booking_type: b.booking_type,
            scheduled_at: b.scheduled_date && b.scheduled_time ? `${b.scheduled_date}T${b.scheduled_time}` : null,
            prealert_sent: b.prealert_sent,
            request_status: r.status,
            shown_to_worker: false,
          });
          return null;
        }
        return {
          booking_request_id: r.id,
          booking_id: r.booking_id,
          status: r.status,
          timeout_at: r.timeout_at,
          offered_at: r.offered_at,
          popup_shown_at: r.popup_shown_at,
          worker_seen_at: r.worker_seen_at,
          booking: {
            id: b.id,
            service_type: b.service_type,
            community: b.community,
            cust_name: b.cust_name,
            flat_no: b.flat_no,
            address_line1: (b as any).address_line1 ?? null,
            price_inr: b.price_inr,
            scheduled_date: b.scheduled_date,
            scheduled_time: b.scheduled_time,
            booking_type: b.booking_type,
            prealert_sent: b.prealert_sent,
          },
        };
      })
      .filter(Boolean);

    return json({ pending, server_time: nowIso });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[get-pending-worker-bookings] fatal", msg);
    return json({ error: "fatal", detail: msg }, 500);
  }
});
