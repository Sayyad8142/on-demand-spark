import { useState, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";

export interface ReadinessCheck {
  label: string;
  status: "pass" | "fail" | "warn" | "checking";
  detail?: string;
  actionable?: boolean;
}

export function useDeviceReadiness(userId: string | undefined) {
  const [checks, setChecks] = useState<ReadinessCheck[]>([]);
  const [loading, setLoading] = useState(true);

  const runChecks = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const results: ReadinessCheck[] = [];

    // 1. Notification permission
    try {
      if (Capacitor.isNativePlatform()) {
        const perm = await PushNotifications.checkPermissions();
        results.push({
          label: "Notification Permission",
          status: perm.receive === "granted" ? "pass" : "fail",
          detail: perm.receive === "granted" ? "Granted" : "Not granted — you will miss booking alerts",
          actionable: perm.receive !== "granted",
        });
      } else if (typeof Notification !== "undefined") {
        const perm = Notification.permission;
        results.push({
          label: "Notification Permission",
          status: perm === "granted" ? "pass" : perm === "denied" ? "fail" : "warn",
          detail: perm === "granted" ? "Granted" : perm === "denied" ? "Blocked — enable in browser settings" : "Not yet requested",
          actionable: perm !== "granted",
        });
      }
    } catch {
      results.push({ label: "Notification Permission", status: "warn", detail: "Could not check" });
    }

    // 2. FCM token available
    try {
      const { data: worker } = await supabase
        .from("workers")
        .select("fcm_token, fcm_token_status")
        .eq("user_id", userId)
        .maybeSingle();

      if (worker?.fcm_token && worker.fcm_token_status !== "invalid") {
        results.push({ label: "FCM Token", status: "pass", detail: "Active token registered" });
      } else if (worker?.fcm_token_status === "invalid") {
        results.push({ label: "FCM Token", status: "fail", detail: "Token marked invalid — restart app to refresh", actionable: true });
      } else {
        results.push({ label: "FCM Token", status: "fail", detail: "No token — push notifications will not work", actionable: true });
      }
    } catch {
      results.push({ label: "FCM Token", status: "warn", detail: "Could not check" });
    }

    // 3. Internet connectivity
    results.push({
      label: "Internet Connection",
      status: navigator.onLine ? "pass" : "fail",
      detail: navigator.onLine ? "Connected" : "No internet connection",
    });

    // 4. App version
    try {
      const { CURRENT_VERSION_CODE } = await import("@/config/version");
      results.push({
        label: "App Version",
        status: "pass",
        detail: `Version code: ${CURRENT_VERSION_CODE}`,
      });
    } catch {
      results.push({ label: "App Version", status: "warn", detail: "Could not determine" });
    }

    // 5. Session validity
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const expiresAt = (session.expires_at || 0) * 1000;
        const isValid = expiresAt > Date.now();
        results.push({
          label: "Auth Session",
          status: isValid ? "pass" : "warn",
          detail: isValid ? "Valid session" : "Session may be expired — reopen app",
        });
      } else {
        results.push({ label: "Auth Session", status: "fail", detail: "No session — please log in" });
      }
    } catch {
      results.push({ label: "Auth Session", status: "warn", detail: "Could not check" });
    }

    setChecks(results);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const hasCriticalFailure = checks.some(
    (c) => c.status === "fail" && (c.label === "Notification Permission" || c.label === "FCM Token")
  );

  return { checks, loading, hasCriticalFailure, refresh: runChecks };
}
