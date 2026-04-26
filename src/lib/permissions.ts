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

import { App as CapApp } from "@capacitor/app";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { Device } from "@capacitor/device";
import { requestActivityRecognitionPermission } from "@/lib/activityRecognition";

interface OverlayPlugin {
  checkPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean; opened?: boolean; manufacturer?: string }>;
  openOverlaySettings(): Promise<{ opened: boolean; manufacturer?: string }>;
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

export interface PermissionDebugEvent {
  permissionId: PermissionId;
  step: string;
  status: "started" | "success" | "fallback" | "failed";
  fallbackPath?: string;
  message?: string;
  error?: string;
  at: string;
}

let permissionDebugReporter: ((event: PermissionDebugEvent) => void) | null = null;

export function setPermissionDebugReporter(reporter: ((event: PermissionDebugEvent) => void) | null) {
  permissionDebugReporter = reporter;
}

function reportPermissionDebug(event: Omit<PermissionDebugEvent, "at">) {
  permissionDebugReporter?.({ ...event, at: new Date().toLocaleTimeString() });
}

interface StepCounterPlugin {
  checkSupport(): Promise<{ supported: boolean; sensorType: string }>;
  checkPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
}

interface BatteryPlugin {
  isIgnoring(): Promise<{ ignoring: boolean }>;
  request(): Promise<{ requested: boolean; opened?: boolean; manufacturer?: string }>;
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

async function tryOpenAppSettingsFallback(reason: "overlay" | "battery" | "activity"): Promise<boolean> {
  try {
    const appPlugin = CapApp as unknown as { openSettings?: () => Promise<void> };
    if (typeof appPlugin.openSettings !== "function") {
      console.warn(`[Permissions] App.openSettings unavailable for ${reason} fallback`);
      return false;
    }
    await appPlugin.openSettings();
    console.log(`[Permissions] ✅ App.openSettings() opened app settings as ${reason} fallback`);
    return true;
  } catch (error) {
    console.warn(`[Permissions] App.openSettings failed for ${reason} fallback`, error);
    return false;
  }
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
  reportPermissionDebug({ permissionId: "overlay", step: "requestPermission", status: "started", message: "Opening Android overlay settings" });
  const p = getOverlayPlugin();
  if (!p) {
    const msg = "[Permissions] OverlayPlugin not available (registerPlugin returned null)";
    console.error(msg);
    reportPermissionDebug({ permissionId: "overlay", step: "plugin", status: "failed", error: msg });
    throw new Error(msg);
  }
  console.log("[Permissions] OverlayPlugin detected — invoking requestPermission()");
  // Native plugin tries 3 fallbacks (per-pkg → global → app details). If
  // requestPermission succeeds, settings opened — DO NOT throw, even though
  // the immediate `granted` value will be false (user hasn't toggled yet).
  try {
    const result = await p.requestPermission();
    console.log("[Permissions] ✅ OverlayPlugin.requestPermission resolved", result);
    if (result?.opened) {
      reportPermissionDebug({ permissionId: "overlay", step: "requestPermission", status: "success", fallbackPath: "per-package/global/app-details native chain", message: "Native settings screen opened" });
      return false;
    }
    if (result?.granted) {
      reportPermissionDebug({ permissionId: "overlay", step: "checkPermission", status: "success", message: "Overlay permission already granted" });
      return true;
    }
  } catch (e) {
    console.warn("[Permissions] OverlayPlugin.requestPermission rejected — trying openOverlaySettings", e);
    reportPermissionDebug({ permissionId: "overlay", step: "requestPermission", status: "fallback", fallbackPath: "openOverlaySettings", error: e instanceof Error ? e.message : String(e) });
    try {
      const fallback = await p.openOverlaySettings();
      console.log("[Permissions] ✅ OverlayPlugin.openOverlaySettings resolved", fallback);
      if (fallback?.opened) {
        reportPermissionDebug({ permissionId: "overlay", step: "openOverlaySettings", status: "success", fallbackPath: "explicit native overlay settings", message: "Fallback settings screen opened" });
        return false;
      }
    } catch (e2) {
      console.warn("[Permissions] OverlayPlugin.openOverlaySettings also failed — falling back to app settings", e2);
      reportPermissionDebug({ permissionId: "overlay", step: "openOverlaySettings", status: "fallback", fallbackPath: "Capacitor App.openSettings", error: e2 instanceof Error ? e2.message : String(e2) });
      try {
        const opened = await tryOpenAppSettingsFallback("overlay");
        if (opened) {
          reportPermissionDebug({ permissionId: "overlay", step: "App.openSettings", status: "success", fallbackPath: "Android app settings", message: "App settings opened as last resort" });
          return false;
        }
        throw e2;
      } catch (e3) {
        console.error("[Permissions] ❌ All overlay setting paths failed", e3);
        reportPermissionDebug({ permissionId: "overlay", step: "all fallback paths", status: "failed", fallbackPath: "none left", error: e3 instanceof Error ? e3.message : String(e3) });
        throw e3;
      }
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
    reportPermissionDebug({ permissionId: "battery", step: "plugin", status: "failed", error: msg });
    throw new Error(msg);
  }
  try {
    console.log("[Permissions] 🟦 requestBatteryExemption() invoked — opening Android Settings...");
    console.log("[Permissions] BatteryOptimization plugin detected — invoking request()");
    reportPermissionDebug({ permissionId: "battery", step: "request", status: "started", message: "Opening Android battery settings" });
    const result = await plugin.request();
    console.log("[Permissions] ✅ BatteryOptimization.request resolved", result);
    if (result?.opened) {
      reportPermissionDebug({ permissionId: "battery", step: "request", status: "success", fallbackPath: "battery optimization native chain", message: "Battery settings screen opened" });
      return false;
    }
    // Settings opened — user must flip the toggle. Re-check after delay; do
    // NOT throw if still not ignoring (that's expected on first open).
    await new Promise(r => setTimeout(r, 400));
    const { ignoring } = await plugin.isIgnoring().catch(() => ({ ignoring: false }));
    console.log("[Permissions] Battery isIgnoring after request:", ignoring);
    reportPermissionDebug({ permissionId: "battery", step: "isIgnoring", status: ignoring ? "success" : "failed", message: ignoring ? "Battery optimization disabled" : "Battery optimization still enabled" });
    return ignoring;
  } catch (e) {
    console.warn("[Permissions] BatteryOptimization.request failed — falling back to app settings", e);
    reportPermissionDebug({ permissionId: "battery", step: "request", status: "fallback", fallbackPath: "Capacitor App.openSettings", error: e instanceof Error ? e.message : String(e) });
    try {
      const opened = await tryOpenAppSettingsFallback("battery");
      if (opened) {
        reportPermissionDebug({ permissionId: "battery", step: "App.openSettings", status: "success", fallbackPath: "Android app settings", message: "App settings opened as last resort" });
        return false;
      }
      throw e;
    } catch (e2) {
      console.error("[Permissions] ❌ requestBatteryExemption failed (no settings screen could be opened)", e2);
      reportPermissionDebug({ permissionId: "battery", step: "all fallback paths", status: "failed", fallbackPath: "none left", error: e2 instanceof Error ? e2.message : String(e2) });
      throw e2;
    }
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
  if (!p) return { id: "activity", status: "missing", canRequest: true };

  // Check sensor support first — no point asking on devices without one
  try {
    const support = await p.checkSupport();
    if (!support.supported) {
      return { id: "activity", status: "not_required", canRequest: false };
    }
  } catch { /* assume supported */ }

  try {
    const { granted } = await p.checkPermission();
    return { id: "activity", status: granted ? "granted" : "missing", canRequest: true };
  } catch (error) {
    console.warn("[Permissions] StepCounter.checkPermission failed", error);
    return { id: "activity", status: "unknown", canRequest: true };
  }
}

export async function requestActivity(): Promise<boolean> {
  reportPermissionDebug({ permissionId: "activity", step: "requestPermission", status: "started", message: "Opening Android physical activity permission prompt" });
  const granted = await requestActivityRecognitionPermission();
  if (granted) {
    reportPermissionDebug({ permissionId: "activity", step: "requestPermission", status: "success", message: "Physical activity permission granted" });
    return true;
  }

  reportPermissionDebug({ permissionId: "activity", step: "requestPermission", status: "fallback", fallbackPath: "Capacitor App.openSettings", message: "Permission was not granted from the prompt; opening app settings" });
  const opened = await tryOpenAppSettingsFallback("activity");
  if (opened) return false;

  const msg = "Physical activity permission was not granted and app settings could not be opened";
  reportPermissionDebug({ permissionId: "activity", step: "App.openSettings", status: "failed", error: msg });
  throw new Error(msg);
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
  return states.some(s => s.status === "missing" || s.status === "denied" || s.status === "unknown");
}
