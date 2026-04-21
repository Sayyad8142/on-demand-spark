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
import { requestActivityRecognitionPermission } from "@/lib/activityRecognition";

interface OverlayPlugin {
  checkPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  openOverlaySettings(): Promise<{ opened: boolean }>;
}

let overlayPlugin: OverlayPlugin | null = null;
function getOverlayPlugin(): OverlayPlugin | null {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return null;
  if (!overlayPlugin) {
    try { overlayPlugin = registerPlugin<OverlayPlugin>("OverlayPlugin"); }
    catch (e) {
      console.error("[Permissions] Failed to registerPlugin('OverlayPlugin')", e);
      return null;
    }
  }
  return overlayPlugin;
}

// Internal helper — uses the SAME registerPlugin instance as requestOverlay()
// so we never mix bridge access patterns. Returns false on any failure.
async function checkOverlayGrantedNative(): Promise<boolean> {
  const p = getOverlayPlugin();
  if (!p) return false;
  try {
    const res = await p.checkPermission();
    return !!res?.granted;
  } catch (e) {
    console.error("[Permissions] OverlayPlugin.checkPermission failed", e);
    return false;
  }
}

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
  const granted = await checkOverlayGrantedNative();
  return {
    id: "overlay",
    status: granted ? "granted" : "missing",
    canRequest: true,
  };
}

export async function requestOverlay(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return true;
  console.log("[Permissions] 🟦 requestOverlay() invoked — opening Android Settings...");
  const p = getOverlayPlugin();
  if (!p) {
    const msg = "[Permissions] OverlayPlugin not available (registerPlugin returned null)";
    console.error(msg);
    throw new Error(msg);
  }
  console.log("[Permissions] OverlayPlugin detected — invoking requestPermission()");
  // Native plugin tries 3 fallbacks (per-pkg → global → app details). If
  // requestPermission succeeds, settings opened — DO NOT throw, even though
  // the immediate `granted` value will be false (user hasn't toggled yet).
  try {
    await p.requestPermission();
    console.log("[Permissions] ✅ OverlayPlugin.requestPermission resolved (settings opened)");
  } catch (e) {
    console.warn("[Permissions] OverlayPlugin.requestPermission rejected — trying openOverlaySettings", e);
    try {
      await p.openOverlaySettings();
      console.log("[Permissions] ✅ OverlayPlugin.openOverlaySettings resolved");
    } catch (e2) {
      console.error("[Permissions] ❌ All overlay setting paths failed", e2);
      throw e2;
    }
  }
  await new Promise(r => setTimeout(r, 400));
  return await checkOverlayGrantedNative();
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
  if (!plugin) {
    const msg = "[Permissions] BatteryOptimization plugin not available — registerPlugin returned null";
    console.error(msg);
    throw new Error(msg);
  }
  try {
    console.log("[Permissions] 🟦 requestBatteryExemption() invoked — opening Android Settings...");
    await plugin.request();
    console.log("[Permissions] ✅ BatteryOptimization.request resolved (settings opened)");
    // Settings opened — user must flip the toggle. Re-check after delay; do
    // NOT throw if still not ignoring (that's expected on first open).
    await new Promise(r => setTimeout(r, 400));
    const { ignoring } = await plugin.isIgnoring().catch(() => ({ ignoring: false }));
    console.log("[Permissions] Battery isIgnoring after request:", ignoring);
    return ignoring;
  } catch (e) {
    console.error("[Permissions] ❌ requestBatteryExemption failed (no settings screen could be opened)", e);
    throw e;
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
