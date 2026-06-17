import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const search = (url.searchParams.get("search") || "").trim();
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "200", 10), 500);
    const filter = (url.searchParams.get("filter") || "").trim(); // failures3 | permdenied | noheartbeat30

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let query = supabase
      .from("workers")
      .select(
        "id, full_name, phone, community, is_active, is_available, is_busy, is_blocked, payout_ready, service_types, last_heartbeat_at, fcm_token, fcm_token_status, fcm_token_platform, fcm_token_updated_at, last_fcm_token_refresh_at, last_notification_received_at, fcm_last_send_at, fcm_last_fail_at, fcm_last_fail_reason, notification_health, notification_health_score, notification_health_updated_at, notification_permission, notification_permission_granted, overlay_permission_granted, overlay_permission_updated_at, notification_repair_failures, app_version, last_app_opened_at",
      )
      .order("notification_repair_failures", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    if (filter === "failures3") {
      query = query.gte("notification_repair_failures", 3);
    } else if (filter === "permdenied") {
      query = query.eq("notification_permission", "denied");
    } else if (filter === "overlay_missing") {
      query = query.eq("overlay_permission_granted", false);
    } else if (filter === "notif_missing") {
      query = query.eq("notification_permission_granted", false);
    } else if (filter === "noheartbeat30") {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      query = query.or(`last_heartbeat_at.lt.${thirtyDaysAgo},last_heartbeat_at.is.null`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const workers = (data || []).map((w: any) => {
      // Derive dispatch eligibility (mirrors booking-notifications filter).
      // Permission columns: explicit `false` blocks; `null`/`true` allowed.
      const blockReasons: string[] = [];
      if (w.is_active === false) blockReasons.push("inactive");
      if (w.is_available === false) blockReasons.push("availability_off");
      if (w.is_busy === true) blockReasons.push("is_busy");
      if (w.is_blocked === true) blockReasons.push("is_blocked");
      if (w.payout_ready !== true) blockReasons.push("payout_not_ready");
      if (!w.fcm_token) blockReasons.push("no_fcm_token");
      else if (w.fcm_token_status === "invalid") blockReasons.push("token_invalid");
      if (w.notification_permission_granted === false) blockReasons.push("notifications_missing");
      if (w.overlay_permission_granted === false) blockReasons.push("overlay_missing");

      const notifStatus = w.notification_permission_granted === false
        ? "missing"
        : w.notification_permission_granted === true
          ? "enabled"
          : "unknown";
      const overlayStatus = w.overlay_permission_granted === false
        ? "missing"
        : w.overlay_permission_granted === true
          ? "enabled"
          : "unknown";

      return {
        ...w,
        fcm_token: w.fcm_token ? `${String(w.fcm_token).slice(0, 12)}…` : null,
        has_token: !!w.fcm_token,
        notifications_status: notifStatus,
        overlay_status: overlayStatus,
        // Activity is reported separately by the app but never blocks dispatch.
        // Surface it as "not_tracked" until we add a column for it.
        activity_status: "not_tracked",
        dispatch_eligible: blockReasons.length === 0,
        block_reasons: blockReasons,
      };
    });

    // Auto-repair metrics
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [todayRes, weekRes, invalidRes, missingRes, manualRes] = await Promise.all([
      supabase.from("token_repair_events").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
      supabase.from("token_repair_events").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
      supabase.from("token_repair_events").select("id", { count: "exact", head: true }).eq("event_type", "invalid_recovered").gte("created_at", weekAgo),
      supabase.from("token_repair_events").select("id", { count: "exact", head: true }).eq("event_type", "missing_recovered").gte("created_at", weekAgo),
      // Workers still needing manual intervention: invalid token OR missing token AND last app open > 3 days ago
      supabase.from("workers").select("id", { count: "exact", head: true })
        .or("fcm_token_status.eq.invalid,fcm_token.is.null")
        .or(`last_app_opened_at.lt.${new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()},last_app_opened_at.is.null`),
    ]);

    const repair_metrics = {
      auto_repaired_today: todayRes.count ?? 0,
      auto_repaired_week: weekRes.count ?? 0,
      invalid_recovered_week: invalidRes.count ?? 0,
      missing_recovered_week: missingRes.count ?? 0,
      needs_manual_intervention: manualRes.count ?? 0,
    };

    return new Response(JSON.stringify({ workers, count: workers.length, repair_metrics }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("admin-token-health error:", e);
    return new Response(JSON.stringify({ error: e?.message || "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
