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
        "id, full_name, phone, community, last_heartbeat_at, fcm_token, fcm_token_status, fcm_token_platform, fcm_token_updated_at, last_fcm_token_refresh_at, last_notification_received_at, fcm_last_send_at, fcm_last_fail_at, fcm_last_fail_reason, notification_health, notification_health_score, notification_health_updated_at, notification_permission, notification_repair_failures",
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
    } else if (filter === "noheartbeat30") {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      query = query.or(`last_heartbeat_at.lt.${thirtyDaysAgo},last_heartbeat_at.is.null`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const workers = (data || []).map((w: any) => ({
      ...w,
      fcm_token: w.fcm_token ? `${String(w.fcm_token).slice(0, 12)}…` : null,
      has_token: !!w.fcm_token,
    }));

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
