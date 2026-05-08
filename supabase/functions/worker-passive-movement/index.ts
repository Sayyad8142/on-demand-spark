// Passive movement sample sink: lightweight step samples while a worker is online,
// independent of any active booking. Writes to public.worker_passive_movement.
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
    const stepCount = Number(body.step_count);
    const previousStepCount = Number(body.previous_step_count ?? 0);
    const isMoving = Boolean(body.is_moving);
    const sensorType = typeof body.sensor_type === "string" ? body.sensor_type : null;
    const sampledAt = typeof body.timestamp === "string" ? body.timestamp : new Date().toISOString();
    const source = typeof body.source === "string" ? body.source : "passive";

    if (!uuidRe.test(workerId)) return json({ error: "bad_worker_id" }, 400);
    if (!Number.isFinite(stepCount) || stepCount < 0) return json({ error: "bad_step_count" }, 400);
    if (Number.isNaN(Date.parse(sampledAt))) return json({ error: "bad_timestamp" }, 400);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauth", detail: userErr?.message }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authUid = userData.user.id;

    const { data: callerWorker, error: callerErr } = await admin
      .from("workers")
      .select("id")
      .or(`user_id.eq.${authUid},id.eq.${authUid}`)
      .limit(1)
      .maybeSingle();

    if (callerErr) return json({ error: "worker_lookup_failed", detail: callerErr.message }, 500);
    if (!callerWorker) return json({ error: "worker_not_found" }, 404);
    if (callerWorker.id !== workerId) return json({ error: "worker_not_allowed" }, 403);

    const { error: insertErr } = await admin.from("worker_passive_movement").insert({
      worker_id: workerId,
      step_count: Math.round(stepCount),
      previous_step_count: Number.isFinite(previousStepCount) ? Math.round(previousStepCount) : 0,
      is_moving: isMoving,
      sensor_type: sensorType,
      sampled_at: sampledAt,
      source,
    });

    if (insertErr) return json({ error: "passive_insert_failed", detail: insertErr.message }, 500);

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[worker-passive-movement] fatal", message);
    return json({ error: "fatal", detail: message }, 500);
  }
});
