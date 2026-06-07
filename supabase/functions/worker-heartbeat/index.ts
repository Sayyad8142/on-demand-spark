// worker-heartbeat
//
// Called by the Worker App in these moments:
//   - app open (login, cold start)
//   - app comes to foreground
//   - every 2 minutes while app is in foreground
//
// Updates workers row with:
//   last_heartbeat_at, last_seen_at, last_active_at, last_app_opened_at,
//   app_version, device_manufacturer, notification_permission_granted,
//   battery_optimization_disabled, fcm_token (if changed), fcm_token_status,
//   fcm_token_platform, fcm_token_updated_at, push_health_status.
//
// Auth: dual-mode. Preferred — anon apikey + explicit worker_id (workers.user_id
// or workers.id) so this works even when the user JWT is expired (background).
// Fallback — user JWT.
//
// Source of truth for "is this worker reachable" lives entirely in this fn.

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

type AppState = "open" | "login" | "foreground" | "interval";

interface Body {
  worker_id?: string;            // workers.user_id (Firebase UID) OR workers.id
  fcm_token?: string;
  app_state?: AppState;
  app_version?: string;
  device_info?: {
    manufacturer?: string;
    model?: string;
    os?: string;
    sdk?: number;
    platform?: string;           // android | ios | web
    notification_permission?: "granted" | "denied" | "default" | "unknown";
    battery_optimized?: boolean; // true = battery optimization ON (bad)
    overlay_granted?: boolean;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Body;
    const { worker_id, fcm_token, app_state, app_version, device_info } = body;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Resolve worker row
    let row: {
      id: string;
      user_id: string | null;
      fcm_token: string | null;
      fcm_token_status: string | null;
      no_ack_count: number | null;
    } | null = null;
    let resolvedVia: "device_worker_id" | "jwt" | null = null;

    if (worker_id) {
      const { data } = await admin
        .from("workers")
        .select("id, user_id, fcm_token, fcm_token_status, no_ack_count")
        .or(`user_id.eq.${worker_id},id.eq.${worker_id}`)
        .maybeSingle();
      if (data?.id) { row = data; resolvedVia = "device_worker_id"; }
    }

    if (!row) {
      try {
        const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: userData } = await userClient.auth.getUser();
        const uid = userData?.user?.id;
        if (uid) {
          const { data } = await admin
            .from("workers")
            .select("id, user_id, fcm_token, fcm_token_status, no_ack_count")
            .eq("user_id", uid)
            .maybeSingle();
          if (data?.id) { row = data; resolvedVia = "jwt"; }
        }
      } catch (_) { /* ignore */ }
    }

    if (!row) {
      console.warn("[heartbeat] worker_unresolved", { worker_id, app_state });
      return json({ error: "worker_unresolved" }, 403);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      last_heartbeat_at: now,
      last_seen_at: now,
      last_active_at: now,
      updated_at: now,
    };

    // last_app_opened_at — set on open/login/foreground (not on the 2-min beat)
    if (app_state === "open" || app_state === "login" || app_state === "foreground") {
      updates.last_app_opened_at = now;
    }

    if (app_version) updates.app_version = app_version;

    if (device_info) {
      if (device_info.manufacturer) updates.device_manufacturer = device_info.manufacturer;
      if (device_info.notification_permission) {
        updates.notification_permission_granted = device_info.notification_permission === "granted";
      }
      if (typeof device_info.battery_optimized === "boolean") {
        updates.battery_optimization_disabled = !device_info.battery_optimized;
      }
    }

    // FCM token — auto-heal logic
    //   - write fresh token whenever it changes
    //   - whenever a valid token arrives, restore status='active' and clear
    //     invalid/expired/no-ack flags so dispatch picks the worker back up
    let tokenChanged = false;
    let repairKind: "missing_recovered" | "invalid_recovered" | "rotated" | null = null;

    const incomingToken = fcm_token && fcm_token.length > 20 ? fcm_token : null;
    const previousStatus = row.fcm_token_status;

    if (incomingToken) {
      if (!row.fcm_token) repairKind = "missing_recovered";
      else if (previousStatus === "invalid" || previousStatus === "expired") repairKind = "invalid_recovered";
      else if (incomingToken !== row.fcm_token) repairKind = "rotated";

      if (incomingToken !== row.fcm_token || previousStatus !== "active") {
        updates.fcm_token = incomingToken;
        updates.fcm_token_status = "active";
        updates.fcm_token_platform = device_info?.platform ?? "android";
        updates.fcm_token_updated_at = now;
        updates.last_fcm_token_refresh_at = now;
        updates.fcm_last_fail_reason = null;
        tokenChanged = incomingToken !== row.fcm_token;
        // Reset no_ack_count so dispatcher gives the worker another chance
        if ((row.no_ack_count ?? 0) > 0) updates.no_ack_count = 0;
      }
    }


    // Derive push_health_status
    const notifOk = device_info?.notification_permission === "granted" || device_info?.notification_permission === undefined;
    const hasToken = !!(updates.fcm_token ?? row.fcm_token);
    let health: "good" | "degraded" | "blocked" = "good";
    if (!hasToken) health = "blocked";
    else if (!notifOk || device_info?.battery_optimized === true) health = "degraded";
    updates.push_health_status = health;

    const { error: upErr } = await admin
      .from("workers")
      .update(updates)
      .eq("id", row.id);
    if (upErr) {
      console.error("[heartbeat] update_failed", upErr.message);
      return json({ error: "update_failed", detail: upErr.message }, 500);
    }

    // Log auto-repair event for admin metrics
    if (repairKind) {
      try {
        await admin.from("token_repair_events").insert({
          worker_id: row.id,
          event_type: repairKind,
          previous_status: previousStatus,
          new_status: "active",
          source: app_state === "open" || app_state === "login" ? "app_open" : "heartbeat",
          detail: { app_state, app_version: app_version ?? null },
        });
        console.log(`[heartbeat] token_auto_repaired worker=${row.id} kind=${repairKind} prev=${previousStatus}`);
      } catch (logErr) {
        console.warn("[heartbeat] repair_event_log_failed", logErr);
      }
    }

    console.log("[heartbeat] ok", {
      worker: row.id,
      app_state,
      resolved_via: resolvedVia,
      token_changed: tokenChanged,
      repair: repairKind,
      health,
    });

    return json({
      ok: true,
      worker_id: row.id,
      resolved_via: resolvedVia,
      token_changed: tokenChanged,
      token_repaired: repairKind,
      push_health_status: health,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[heartbeat] fatal", msg);
    return json({ error: "fatal", detail: msg }, 500);
  }
});
