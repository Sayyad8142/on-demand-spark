// worker-boot-ping
// Called by the Android BootReceiver / FcmBootSyncWorker after the device
// reboots OR after the app is updated. Records the boot, syncs the latest
// FCM token, and returns success. Public (verify_jwt = false) — guarded by
// requiring a valid worker user_id present in the workers table.

import { createClient } from "npm:@supabase/supabase-js@2.50.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface BootPingBody {
  user_id?: string;
  fcm_token?: string;
  event?: "boot" | "package_replaced" | "fcm_received" | "manual";
  oem?: string;
  android_version?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as BootPingBody;
    const userId = (body.user_id || "").trim();
    const event = body.event || "boot";

    if (!userId) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resolve worker (user_id is text — Firebase UID).
    const { data: worker, error: workerErr } = await supabase
      .from("workers")
      .select("id, user_id, fcm_token")
      .eq("user_id", userId)
      .maybeSingle();

    if (workerErr) {
      console.error("[boot-ping] worker lookup error", workerErr);
      return new Response(JSON.stringify({ error: "lookup_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!worker) {
      return new Response(JSON.stringify({ error: "worker_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      updated_at: now,
    };

    if (event === "boot" || event === "package_replaced") {
      update.last_boot_at = now;
      if (body.oem) update.last_boot_oem = String(body.oem).slice(0, 64);
      if (body.android_version) {
        update.last_boot_android_version = String(body.android_version).slice(
          0,
          16,
        );
      }
    }

    if (event === "fcm_received") {
      update.last_notification_received_at = now;
    }

    if (body.fcm_token && typeof body.fcm_token === "string") {
      const tok = body.fcm_token.trim();
      if (tok.length > 20) {
        update.fcm_token = tok;
        update.fcm_token_status = "active";
        update.fcm_token_platform = "android";
        update.fcm_token_updated_at = now;
        update.last_fcm_token_refresh_at = now;
      }
    }

    const { error: updErr } = await supabase
      .from("workers")
      .update(update)
      .eq("id", worker.id);

    if (updErr) {
      console.error("[boot-ping] update error", updErr);
      return new Response(JSON.stringify({ error: "update_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(
      `[boot-ping] ok worker=${worker.id} event=${event} token_synced=${!!update
        .fcm_token}`,
    );

    return new Response(
      JSON.stringify({ ok: true, event, token_synced: !!update.fcm_token }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("[boot-ping] exception", e);
    return new Response(JSON.stringify({ error: "exception" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
