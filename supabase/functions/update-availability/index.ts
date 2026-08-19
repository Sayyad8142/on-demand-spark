import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
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

interface Body {
  is_available: boolean;
  worker_id?: string; // Informational only
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const { is_available } = body;

    if (typeof is_available !== "boolean") {
      return json({ error: "is_available must be a boolean" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Verify Firebase token and derive UID
    // We use the same pattern as worker-heartbeat: try to authenticate via user client
    // Since Firebase profiles are synced to auth.users, auth.getUser() returns the mapped user.
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      console.error("[update-availability] auth_failed", authError?.message);
      return json({ error: "Unauthorized", detail: authError?.message }, 401);
    }

    // 2. Look up worker by user_id (Firebase UID)
    // IMPORTANT: We trust the UID from the token, not the worker_id from the body.
    const { data: worker, error: workerError } = await admin
      .from("workers")
      .select("id, full_name, is_available")
      .eq("user_id", user.id)
      .maybeSingle();

    if (workerError) {
      console.error("[update-availability] worker_lookup_failed", workerError.message);
      return json({ error: "internal_error" }, 500);
    }

    if (!worker) {
      console.warn("[update-availability] worker_not_found", { uid: user.id });
      return json({ error: "worker_not_found" }, 404);
    }

    // 3. Update availability
    // We reuse the existing logic: update is_available and timestamps
    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from("workers")
      .update({
        is_available,
        updated_at: now,
        // Existing logic often sets availability_on/off or status
        // The RPC 'update_worker_availability' in DB does more, so we call it via admin if possible
        // or just perform the update here.
      })
      .eq("id", worker.id);

    if (updateError) {
      console.error("[update-availability] update_failed", updateError.message);
      return json({ error: "update_failed" }, 500);
    }

    // Log the change
    console.log(`[update-availability] worker=${worker.id} name="${worker.full_name}" is_available=${is_available}`);

    return json({
      ok: true,
      worker_id: worker.id,
      is_available,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[update-availability] fatal", msg);
    return json({ error: "fatal", detail: msg }, 500);
  }
});
