// Records a missed-booking diagnostic snapshot uploaded by the Worker App.
// Uses service_role internally to bypass RLS and validate worker_id server-side.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      worker_id,
      user_id,
      booking_id,
      booking_request_id,
      reason,
      app_state,
      notification_permission,
      overlay_granted,
      battery_optimized,
      fcm_token_status,
      fcm_token_present,
      is_online_toggle,
      network_online,
      last_heartbeat_at,
      last_notification_at,
      app_version,
      platform,
      manufacturer,
      model,
      sdk,
      extra,
    } = body ?? {};

    if (!reason || (!worker_id && !user_id)) {
      return new Response(
        JSON.stringify({ error: "reason and worker_id or user_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Dedupe: if we already have a row for this booking_id+worker in the last 10 minutes, skip.
    if (booking_id && (worker_id || user_id)) {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: existing } = await supabase
        .from("worker_missed_booking_diagnostics")
        .select("id")
        .eq("booking_id", booking_id)
        .gte("created_at", tenMinAgo)
        .limit(1)
        .maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ ok: true, deduped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data, error } = await supabase
      .from("worker_missed_booking_diagnostics")
      .insert({
        worker_id: worker_id ?? null,
        user_id: user_id ?? null,
        booking_id: booking_id ?? null,
        booking_request_id: booking_request_id ?? null,
        reason: String(reason).slice(0, 200),
        app_state: app_state ?? null,
        notification_permission: notification_permission ?? null,
        overlay_granted: overlay_granted ?? null,
        battery_optimized: battery_optimized ?? null,
        fcm_token_status: fcm_token_status ?? null,
        fcm_token_present: fcm_token_present ?? null,
        is_online_toggle: is_online_toggle ?? null,
        network_online: network_online ?? null,
        last_heartbeat_at: last_heartbeat_at ?? null,
        last_notification_at: last_notification_at ?? null,
        app_version: app_version ?? null,
        platform: platform ?? null,
        manufacturer: manufacturer ?? null,
        model: model ?? null,
        sdk: typeof sdk === "number" ? sdk : null,
        extra: extra ?? {},
      })
      .select("id")
      .single();

    if (error) {
      console.error("[report-missed-booking] insert failed", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[report-missed-booking] threw", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
