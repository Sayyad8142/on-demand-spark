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

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const workerId = String(body.worker_id ?? "");
    const bookingId = String(body.booking_id ?? "");
    const stepCount = Number(body.step_count);
    const previousStepCount = Number(body.previous_step_count ?? 0);
    const timestamp = typeof body.timestamp === "string" ? body.timestamp : new Date().toISOString();
    const isMoving = Boolean(body.is_moving);

    if (!uuidRe.test(workerId)) return json({ error: "bad_worker_id" }, 400);
    if (!uuidRe.test(bookingId)) return json({ error: "bad_booking_id" }, 400);
    if (!Number.isFinite(stepCount) || stepCount < 0) return json({ error: "bad_step_count" }, 400);
    if (Number.isNaN(Date.parse(timestamp))) return json({ error: "bad_timestamp" }, 400);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauth", detail: userErr?.message }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authUid = userData.user.id;
    const { data: worker, error: workerErr } = await admin
      .from("workers")
      .select("id, user_id")
      .eq("id", workerId)
      .maybeSingle();

    if (workerErr) return json({ error: "worker_lookup_failed", detail: workerErr.message }, 500);
    if (!worker || worker.user_id !== authUid) return json({ error: "worker_not_allowed" }, 403);

    const { data: booking, error: bookingErr } = await admin
      .from("bookings")
      .select("id, worker_id, status")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingErr) return json({ error: "booking_lookup_failed", detail: bookingErr.message }, 500);
    if (!booking || booking.worker_id !== workerId) return json({ error: "booking_not_assigned_to_worker" }, 403);

    const movementStatus = isMoving ? "moving" : "not_moving";
    const { error: upsertErr } = await admin
      .from("booking_worker_movement_checks")
      .upsert({
        booking_id: bookingId,
        worker_id: workerId,
        sensor_supported: true,
        permission_granted: true,
        steps_in_window: Math.round(stepCount),
        final_step_value: Math.round(stepCount),
        movement_status: movementStatus,
        low_movement_flag: !isMoving,
        low_movement_reason: isMoving ? null : "No step increase detected in the current tracking window",
        checked_at: timestamp,
        raw_meta: {
          current_step_count: Math.round(stepCount),
          previous_step_count: Number.isFinite(previousStepCount) ? Math.round(previousStepCount) : 0,
          is_moving: isMoving,
          client_timestamp: timestamp,
          source: body.source ?? "worker-app",
          booking_status: booking.status,
        },
      }, { onConflict: "booking_id,worker_id" });

    if (upsertErr) return json({ error: "movement_update_failed", detail: upsertErr.message }, 500);

    console.log("[worker-movement-update] success", {
      worker_id: workerId,
      booking_id: bookingId,
      step_count: Math.round(stepCount),
      is_moving: isMoving,
      timestamp,
    });

    return json({ ok: true, success: true, movement_status: movementStatus, step_count: Math.round(stepCount) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[worker-movement-update] fatal", message);
    return json({ error: "fatal", detail: message }, 500);
  }
});
