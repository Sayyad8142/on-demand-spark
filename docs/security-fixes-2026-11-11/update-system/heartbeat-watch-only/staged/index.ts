import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyHeartbeat, shortId, withTimeout, type AuditOutcome } from "./heartbeat_audit.ts";

// WATCH-ONLY (2026-11-11): records identity outcome; behaviour below is the
// recovered live code, unchanged. Kill switch: HEARTBEAT_AUDIT=off.
const AUDIT_ON = (Deno.env.get('HEARTBEAT_AUDIT') ?? 'observe') !== 'off';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Worker Heartbeat Endpoint
 * 
 * Called every 30-60 seconds by the worker app while worker is online.
 * Updates last_heartbeat_at and logs to worker_heartbeats table.
 * Also accepts device health metadata for reachability scoring.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      worker_id,
      app_state,        // foreground | background
      battery_level,    // 0-100
      network_type,     // wifi | cellular | none
      app_version,
      notification_permission_granted,
      battery_optimization_disabled,
      device_manufacturer,
      fcm_token,        // optional: refresh token on heartbeat
      // New telemetry fields (worker-app v2+)
      overlay_permission,            // 'granted' | 'denied' | 'unknown'
      battery_optimization_status,   // 'disabled' | 'enabled' | 'unknown'
      device_info,                   // jsonb: { model, os, sdk, manufacturer, ... }
      notification_permission,       // 'granted' | 'denied' | 'unknown'
    } = await req.json();

    // Watch-only audit runs in parallel; awaited (max 1.5 s) only at the end, never throws.
    let auditDone: Promise<AuditOutcome | null> = Promise.resolve(null);
    if (AUDIT_ON) {
      const url = Deno.env.get('SUPABASE_URL')!;
      const svc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      auditDone = withTimeout(classifyHeartbeat(req.headers.get('Authorization'), worker_id, {
        verifyUser: async (token) => {
          const { data, error } = await svc.auth.getUser(token);
          return error ? null : (data?.user?.id ?? null);
        },
        workerIdForUser: async (uid) => {
          const { data } = await svc.from('workers').select('id').eq('user_id', uid).limit(1).maybeSingle();
          return (data as { id?: string } | null)?.id ?? null;
        },
      }).then((outcome) => {
        console.log('[heartbeat-audit]', JSON.stringify({
          outcome, worker: shortId(worker_id), app_version: app_version ?? null, app_state: app_state ?? null,
        }));
        return outcome;
      }), 1500, null);
    }
    const finishAudit = () => auditDone.catch(() => null);

    if (!worker_id) {
      await finishAudit();
      return new Response(
        JSON.stringify({ error: 'worker_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();

    // 1. Update worker record with heartbeat + device health
    const updatePayload: Record<string, unknown> = {
      last_heartbeat_at: now,
      last_seen_at: now,
    };

    if (app_state) updatePayload.last_app_opened_at = now;
    if (app_state) updatePayload.app_state = app_state;
    if (app_version) updatePayload.app_version = app_version;
    if (device_manufacturer) updatePayload.device_manufacturer = device_manufacturer;
    if (notification_permission_granted !== undefined) updatePayload.notification_permission_granted = notification_permission_granted;
    if (battery_optimization_disabled !== undefined) updatePayload.battery_optimization_disabled = battery_optimization_disabled;
    if (overlay_permission) updatePayload.overlay_permission = overlay_permission;
    if (battery_optimization_status) updatePayload.battery_optimization_status = battery_optimization_status;
    if (device_info && typeof device_info === 'object') updatePayload.device_info = device_info;
    if (notification_permission) updatePayload.notification_permission = notification_permission;

    // Optional: refresh FCM token if provided — also repairs push health
    if (fcm_token) {
      // Use repair RPC to atomically reset push health + token
      await supabase.rpc('repair_worker_push_health', {
        p_worker_id: worker_id,
        p_new_token: fcm_token,
      });
      console.log(`🔧 Token refreshed & push health repaired for ${worker_id}`);
      // Don't overwrite fcm_token in updatePayload — repair RPC already did it
    }

    const { error: updateError } = await supabase
      .from('workers')
      .update(updatePayload)
      .eq('id', worker_id);

    if (updateError) {
      console.error('Failed to update worker heartbeat:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update heartbeat' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Log heartbeat (sampled: only log every ~5th beat to reduce DB writes)
    // Use a simple hash to sample ~20% of heartbeats
    const shouldLog = Math.random() < 0.2;
    if (shouldLog) {
      await supabase.from('worker_heartbeats').insert({
        worker_id,
        heartbeat_at: now,
        app_state: app_state || null,
        battery_level: battery_level || null,
        network_type: network_type || null,
        app_version: app_version || null,
      });
    }

    // 3. Recompute reachability score
    await supabase.rpc('compute_worker_reachability', { p_worker_id: worker_id });

    // 3b. Recompute notification health — clears stale_device immediately on app open
    await supabase.rpc('recompute_worker_notification_health', { p_worker_id: worker_id });

    // 4. Check if there are pending booking requests for this worker
    // (realtime fallback — if FCM was missed, heartbeat response tells app)
    const { data: pendingRequests } = await supabase
      .from('booking_requests')
      .select('id, booking_id, offered_at, timeout_at')
      .eq('worker_id', worker_id)
      .eq('status', 'pending')
      .in('notification_status', ['sent', 'queued'])
      .gt('timeout_at', now)
      .order('offered_at', { ascending: true })
      .limit(3);

    await finishAudit();
    return new Response(
      JSON.stringify({
        success: true,
        heartbeat_at: now,
        pending_bookings: (pendingRequests || []).map(r => ({
          booking_request_id: r.id,
          booking_id: r.booking_id,
          timeout_at: r.timeout_at,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('worker-heartbeat error:', error);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
