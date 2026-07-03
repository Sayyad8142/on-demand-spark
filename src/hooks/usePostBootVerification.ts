/**
 * usePostBootVerification — after Android reboots and worker-boot-ping runs,
 * JS-side must independently verify recovery succeeded before we treat the
 * worker as reachable.
 *
 * Runs once per JS session, ~4s after login on native platforms only.
 *
 * Verifies (in order):
 *   1. Push health snapshot (permission, token exists, backend synced, healthy)
 *   2. Heartbeat endpoint reachable + latest heartbeat within 5 min
 *   3. Realtime subscription can attach and go SUBSCRIBED within 5s
 *
 * If any step fails, triggers automatic push repair + one heartbeat retry.
 * Reports a diagnostic tagged `post_boot_verification_failed` so the
 * server-side watchdog knows to keep the worker paused.
 */

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { triggerAutomaticPushRepair } from "@/services/pushRepairCoordinator";
import { getPushHealthSnapshot } from "@/lib/pushToken";
import { reportMissedBooking } from "@/lib/missedBookingDiagnostics";

let ranThisSession = false;

const HEARTBEAT_FRESH_MS = 5 * 60 * 1000;
const REALTIME_TIMEOUT_MS = 5_000;

async function verifyRealtime(workerId: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
      resolve(ok);
    };
    const channel = supabase
      .channel(`post-boot-verify:${workerId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "booking_requests",
        filter: `worker_id=eq.${workerId}`,
      }, () => { /* no-op */ })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") finish(true);
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") finish(false);
      });
    setTimeout(() => finish(false), REALTIME_TIMEOUT_MS);
  });
}

async function verifyHeartbeat(workerId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("workers")
      .select("last_seen_at, last_active_at")
      .eq("id", workerId)
      .maybeSingle();
    const last = (data as any)?.last_seen_at || (data as any)?.last_active_at;
    if (!last) return false;
    return Date.now() - Date.parse(last) < HEARTBEAT_FRESH_MS;
  } catch {
    return false;
  }
}

export function usePostBootVerification(userId: string | undefined | null, workerId: string | undefined | null) {
  useEffect(() => {
    if (!userId || !workerId) return;
    if (ranThisSession) return;
    if (!Capacitor.isNativePlatform()) { ranThisSession = true; return; }
    ranThisSession = true;

    const t = setTimeout(async () => {
      console.log("🔁 [PostBootVerify] Verifying recovery");

      const failures: string[] = [];

      const push = await getPushHealthSnapshot(userId);
      if (!push.isHealthy) failures.push("push_unhealthy");

      const heartbeatOk = await verifyHeartbeat(workerId);
      if (!heartbeatOk) failures.push("heartbeat_stale");

      const realtimeOk = await verifyRealtime(workerId);
      if (!realtimeOk) failures.push("realtime_disconnected");

      if (failures.length === 0) {
        console.log("✅ [PostBootVerify] all systems healthy");
        return;
      }

      console.warn("⚠️ [PostBootVerify] failures:", failures, "— attempting auto-repair");

      // Try automatic push repair (idempotent) + refresh heartbeat via edge fn.
      try {
        await triggerAutomaticPushRepair(userId, "post-boot-verify");
      } catch (e) {
        console.warn("[PostBootVerify] push repair failed:", e);
      }
      try {
        await supabase.functions.invoke("worker-heartbeat", { body: { app_state: "post_boot_verify" } });
      } catch (e) {
        console.warn("[PostBootVerify] heartbeat retry failed:", e);
      }

      // Re-check realtime once
      const realtimeOk2 = failures.includes("realtime_disconnected")
        ? await verifyRealtime(workerId)
        : true;

      const remaining = [
        ...failures.filter((f) => f !== "push_unhealthy" && f !== "realtime_disconnected"),
        ...(realtimeOk2 ? [] : ["realtime_disconnected"]),
      ];

      if (remaining.length > 0) {
        void reportMissedBooking({
          workerId,
          userId,
          reason: "post_boot_verification_failed",
          extra: { failures, remaining },
        });
      }
    }, 4000);

    return () => clearTimeout(t);
  }, [userId, workerId]);
}
