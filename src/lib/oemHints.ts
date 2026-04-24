/**
 * OEM (Original Equipment Manufacturer) detection + per-vendor permission hints.
 *
 * Used by PermissionOnboarding to show OEM-specific guidance BEFORE the user
 * opens system settings (some OEMs hide overlay/battery toggles in non-obvious
 * places — e.g. MIUI Autostart, Vivo Background Power Consumption).
 */

import { Device } from "@capacitor/device";
import { Capacitor } from "@capacitor/core";

export type OemId =
  | "xiaomi"
  | "vivo"
  | "oppo"
  | "realme"
  | "oneplus"
  | "samsung"
  | "huawei"
  | "honor"
  | "generic";

export interface OemInfo {
  id: OemId;
  manufacturer: string;
  model: string;
  androidApi: number | null;
}

export interface OemHint {
  /** Short label shown above the steps */
  title: string;
  /** Plain-language steps a non-technical worker can follow */
  steps: string[];
}

let cached: OemInfo | null = null;

export async function getOemInfo(): Promise<OemInfo> {
  if (cached) return cached;
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    cached = { id: "generic", manufacturer: "web", model: "web", androidApi: null };
    return cached;
  }
  try {
    const info = await Device.getInfo();
    const mfg = (info.manufacturer || "").toLowerCase();
    const model = info.model || "";
    const api = (info as any)?.androidSDKVersion ?? null;
    const id: OemId =
      mfg.includes("xiaomi") || mfg.includes("redmi") || mfg.includes("poco") ? "xiaomi"
      : mfg.includes("vivo") ? "vivo"
      : mfg.includes("oppo") ? "oppo"
      : mfg.includes("realme") ? "realme"
      : mfg.includes("oneplus") ? "oneplus"
      : mfg.includes("samsung") ? "samsung"
      : mfg.includes("huawei") ? "huawei"
      : mfg.includes("honor") ? "honor"
      : "generic";
    cached = { id, manufacturer: info.manufacturer || "unknown", model, androidApi: api };
    return cached;
  } catch {
    cached = { id: "generic", manufacturer: "unknown", model: "unknown", androidApi: null };
    return cached;
  }
}

export type PermissionKind = "overlay" | "battery" | "notifications" | "activity";

/**
 * Return OEM-specific manual fallback steps. Used when native intents fail
 * AND surfaced as a "Need help?" hint preflight on known-tricky OEMs.
 */
export function getOemHint(oem: OemId, kind: PermissionKind): OemHint | null {
  // Notifications + activity use the standard runtime popup — no OEM quirks.
  if (kind === "notifications" || kind === "activity") return null;

  const APP = "Didi Now Partner";

  if (kind === "overlay") {
    switch (oem) {
      case "xiaomi":
        return {
          title: "On MIUI / Redmi / POCO",
          steps: [
            "Open Settings → Apps → Manage apps",
            `Tap "${APP}"`,
            "Tap Other permissions",
            "Enable Display pop-up windows while running in background",
          ],
        };
      case "vivo":
        return {
          title: "On Vivo / iQOO (FunTouch / OriginOS)",
          steps: [
            "Open Settings → Apps & permissions → Permission manager",
            "Tap Display over other apps",
            `Find "${APP}" and turn it ON`,
          ],
        };
      case "oppo":
      case "realme":
        return {
          title: "On OPPO / Realme (ColorOS / Realme UI)",
          steps: [
            "Open Settings → App Management → App list",
            `Tap "${APP}" → Permissions`,
            "Enable Display over other apps",
          ],
        };
      default:
        return {
          title: "Manual steps",
          steps: [
            "Open Android Settings → Apps",
            `Tap "${APP}" → Advanced / Special access`,
            "Enable Display over other apps",
          ],
        };
    }
  }

  // battery
  switch (oem) {
    case "xiaomi":
      return {
        title: "On MIUI / Redmi / POCO",
        steps: [
          "Open Settings → Battery & performance → App battery saver",
          `Find "${APP}"`,
          "Set to No restrictions",
          "Also: Settings → Apps → Manage apps → Autostart → enable for this app",
        ],
      };
    case "vivo":
      return {
        title: "On Vivo / iQOO",
        steps: [
          "Open Settings → Battery → Background power consumption",
          `Find "${APP}" and allow background activity`,
          "Also: Settings → More settings → Permission Manager → Autostart",
        ],
      };
    case "oppo":
    case "realme":
      return {
        title: "On OPPO / Realme",
        steps: [
          "Open Settings → Battery → Power saving options",
          `Find "${APP}"`,
          "Allow background activity / disable battery optimization",
        ],
      };
    case "samsung":
      return {
        title: "On Samsung (One UI)",
        steps: [
          "Open Settings → Battery & device care → Battery",
          "Tap Background usage limits → Never sleeping apps",
          `Add "${APP}"`,
        ],
      };
    case "huawei":
    case "honor":
      return {
        title: "On Huawei / Honor",
        steps: [
          "Open Settings → Battery → App launch",
          `Find "${APP}" → turn OFF Manage automatically`,
          "Enable Auto-launch, Secondary launch, and Run in background",
        ],
      };
    default:
      return {
        title: "Manual steps",
        steps: [
          "Open Android Settings → Apps",
          `Tap "${APP}" → Battery`,
          "Set to Unrestricted (or remove from battery optimization)",
        ],
      };
  }
}

/** Friendly OEM display name */
export function getOemDisplayName(oem: OemId): string {
  const m: Record<OemId, string> = {
    xiaomi: "Xiaomi / Redmi / POCO",
    vivo: "Vivo / iQOO",
    oppo: "OPPO",
    realme: "Realme",
    oneplus: "OnePlus",
    samsung: "Samsung",
    huawei: "Huawei",
    honor: "Honor",
    generic: "your device",
  };
  return m[oem];
}

/** Whether this OEM is known to require extra manual steps */
export function isTrickyOem(oem: OemId): boolean {
  return ["xiaomi", "vivo", "oppo", "realme", "huawei", "honor"].includes(oem);
}
