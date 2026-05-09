// worker-keepalive-ack
// Native Android calls this after receiving a silent FCM PING. Confirms the
// device is reachable and updates reachability fields. Public (verify_jwt=false)
// — guarded by requiring a worker user_id present in the workers table.

import { createClient } from "npm:@supabase/supabase-js@2.50.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AckBody {
  user_id?: string;
  fcm_token?: string;
  battery_optimized?: boolean;
  app_standby_bucket?: string;
  notification_permission?: "granted" | "denied" | "unknown";
  oem?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as AckBody;
    const userId = (body.user_id || "").trim();
    if (!userId) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: worker } = await supabase
      .from("workers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!worker) {
      return new Response(JSON.stringify({ error: "worker_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      last_keepalive_ack_at: now,
      last_notification_received_at: now,
      consecutive_delivery_failures: 0,
    };
    if (typeof body.battery_optimized === "boolean") update.battery_optimized = body.battery_optimized;
    if (body.app_standby_bucket) update.app_standby_bucket = body.app_standby_bucket;
    if (body.notification_permission) update.notification_permission = body.notification_permission;
    if (body.fcm_token) {
      update.fcm_token = body.fcm_token;
      update.fcm_token_updated_at = now;
      update.last_fcm_token_refresh_at = now;
      update.fcm_token_status = "active";
    }

    const { error: upErr } = await supabase
      .from("workers")
      .update(update)
      .eq("id", worker.id);

    if (upErr) {
      console.error(JSON.stringify({ evt: "keepalive_ack_failed", worker_id: worker.id, err: upErr.message }));
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("notification_delivery_events").insert({
      worker_id: worker.id,
      event_type: "keepalive_ack",
      payload: {
        battery_optimized: body.battery_optimized,
        app_standby_bucket: body.app_standby_bucket,
        notification_permission: body.notification_permission,
        oem: body.oem,
      },
    });

    console.log(JSON.stringify({ evt: "keepalive_ack", worker_id: worker.id }));
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error(JSON.stringify({ evt: "keepalive_ack_fatal", err: msg }));
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
