/**
 * Worker permission orchestration.
 *
 * Centralised helpers to check + request the four worker-critical permissions:
 *   1. Notifications        (POST_NOTIFICATIONS / Notification API)
 *   2. Overlay              (SYSTEM_ALERT_WINDOW — Android only)
 *   3. Battery optimization (REQUEST_IGNORE_BATTERY_OPTIMIZATIONS — Android only)
 *   4. Activity recognition (ACTIVITY_RECOGNITION — Android 10+ only)
 *
 * These power the in-app PermissionOnboarding screen so the user sees one
 * clear explanation flow instead of multiple surprise system dialogs.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { Device } from "@capacitor/device";
import { checkOverlayPermission, requestOverlayPermission } from "@/native/overlay";
import { requestActivityRecognitionPermission } from "@/lib/activityRecognition";

export type PermissionId =
  | "notifications"
  | "overlay"
  | "battery"
  | "activity";

export type PermissionStatus =
  | "granted"
  | "denied"
  | "missing"
  | "not_required"
  | "unknown";

export interface PermissionState {
  id: PermissionId;
  status: PermissionStatus;
  /** True if the OS exposes a way to (re-)request this permission. */
  canRequest: boolean;
}

interface StepCounterPlugin {
  checkSupport(): Promise<{ supported: boolean; sensorType: string }>;
  requestPermission(): Promise<{ granted: boolean }>;
}

interface BatteryPlugin {
  isIgnoring(): Promise<{ ignoring: boolean }>;
  request(): Promise<{ requested: boolean }>;
}

let stepPlugin: StepCounterPlugin | null = null;
function getStepPlugin(): StepCounterPlugin | null {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return null;
  if (!stepPlugin) {
    try { stepPlugin = registerPlugin<StepCounterPlugin>("StepCounter"); }
    catch { return null; }
  }
  return stepPlugin;
}

let batteryPlugin: BatteryPlugin | null = null;
function getBatteryPlugin(): BatteryPlugin | null {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return null;
  if (!batteryPlugin) {
    try {
      batteryPlugin = registerPlugin<BatteryPlugin>("BatteryOptimization");
    } catch { return null; }
  }
  return batteryPlugin;
}

// ---------- Notifications ----------
export async function checkNotificationPermission(): Promise<PermissionState> {
  if (Capacitor.isNativePlatform()) {
    try {
      const perm = await PushNotifications.checkPermissions();
      return {
        id: "notifications",
        status: perm.receive === "granted" ? "granted"
              : perm.receive === "denied"  ? "denied"
              : "missing",
        canRequest: true,
      };
    } catch {
      return { id: "notifications", status: "unknown", canRequest: true };
    }
  }
  if (typeof Notification !== "undefined") {
    return {
      id: "notifications",
      status: Notification.permission === "granted" ? "granted"
            : Notification.permission === "denied"  ? "denied"
            : "missing",
      canRequest: Notification.permission !== "denied",
    };
  }
  return { id: "notifications", status: "not_required", canRequest: false };
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive === "granted") {
        try { await PushNotifications.register(); } catch { /* noop */ }
        return true;
      }
      return false;
    } catch { return false; }
  }
  if (typeof Notification !== "undefined") {
    try {
      const res = await Notification.requestPermission();
      return res === "granted";
    } catch { return false; }
  }
  return false;
}

// ---------- Overlay (Android only) ----------
export async function checkOverlayState(): Promise<PermissionState> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return { id: "overlay", status: "not_required", canRequest: false };
  }
  const granted = await checkOverlayPermission();
  return {
    id: "overlay",
    status: granted ? "granted" : "missing",
    canRequest: true,
  };
}

export async function requestOverlay(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return true;
  // Native plugin opens system Settings — user has to flip a toggle and
  // come back; immediate return value is rarely true. We re-check on resume.
  await requestOverlayPermission();
  // Small delay then re-check
  await new Promise(r => setTimeout(r, 400));
  return await checkOverlayPermission();
}

// ---------- Battery optimization (Android only) ----------
export async function checkBatteryState(): Promise<PermissionState> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return { id: "battery", status: "not_required", canRequest: false };
  }
  const plugin = getBatteryPlugin();
  if (plugin) {
    try {
      const { ignoring } = await plugin.isIgnoring();
      return { id: "battery", status: ignoring ? "granted" : "missing", canRequest: true };
    } catch { /* fall through */ }
  }
  return { id: "battery", status: "unknown", canRequest: true };
}

export async function requestBatteryExemption(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return true;
  const plugin = getBatteryPlugin();
  if (!plugin) return false;
  try {
    await plugin.request();
    // Settings page opened — user has to flip a toggle and come back.
    // Re-check once they return (handled by App resume listener).
    await new Promise(r => setTimeout(r, 400));
    const { ignoring } = await plugin.isIgnoring().catch(() => ({ ignoring: false }));
    return ignoring;
  } catch {
    return false;
  }
}

// ---------- Activity recognition (Android 10+ only) ----------
export async function checkActivityState(): Promise<PermissionState> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return { id: "activity", status: "not_required", canRequest: false };
  }
  // Below API 29 the permission is auto-granted at install time
  try {
    const info = await Device.getInfo();
    const apiLevel = (info as any)?.androidSDKVersion;
    if (typeof apiLevel === "number" && apiLevel < 29) {
      return { id: "activity", status: "not_required", canRequest: false };
    }
  } catch { /* keep going — assume modern Android */ }

  const p = getStepPlugin();
  if (!p) return { id: "activity", status: "not_required", canRequest: false };

  // Check sensor support first — no point asking on devices without one
  try {
    const support = await p.checkSupport();
    if (!support.supported) {
      return { id: "activity", status: "not_required", canRequest: false };
    }
  } catch { /* assume supported */ }

  // We don't have a "checkOnly" method, so we infer state by attempting
  // a no-op check via requestPermission only when the user explicitly taps.
  // Until then, report "missing" so the row is visible.
  return { id: "activity", status: "missing", canRequest: true };
}

export async function requestActivity(): Promise<boolean> {
  return await requestActivityRecognitionPermission();
}

// ---------- Aggregate ----------
export async function checkAllPermissions(): Promise<PermissionState[]> {
  const [notif, overlay, battery, activity] = await Promise.all([
    checkNotificationPermission(),
    checkOverlayState(),
    checkBatteryState(),
    checkActivityState(),
  ]);
  return [notif, overlay, battery, activity];
}

export function hasOutstandingPermissions(states: PermissionState[]): boolean {
  return states.some(s => s.status === "missing" || s.status === "denied");
}
