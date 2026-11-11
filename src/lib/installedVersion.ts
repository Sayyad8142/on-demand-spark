/**
 * The installed app version as reported by the phone (Android versionName/versionCode),
 * not the value typed into the code. Falls back to the build-time constants only when
 * the native value is unavailable (web preview), and says so via `source`.
 */
import { CURRENT_VERSION_CODE, CURRENT_VERSION_NAME } from "@/config/version";

export interface InstalledVersion {
  version: string;
  build: number | null;
  platform: string;
  source: "native" | "config";
}

export function parseNativeAppInfo(info: unknown, platform: string): InstalledVersion | null {
  if (!info || typeof info !== "object") return null;
  const r = info as Record<string, unknown>;
  const version = typeof r.version === "string" && r.version.trim() && r.version.length <= 40 ? r.version.trim() : null;
  const n = typeof r.build === "string" ? Number(r.build) : r.build;
  const build = typeof n === "number" && Number.isInteger(n) && n > 0 && n < 1e9 ? n : null;
  if (!version || build === null) return null;
  return { version, build, platform, source: "native" };
}

export function configVersion(platform: string): InstalledVersion {
  return { version: CURRENT_VERSION_NAME, build: CURRENT_VERSION_CODE, platform, source: "config" };
}

let cached: InstalledVersion | null = null;

/** Synchronous best-known value (native once loaded, otherwise config). */
export function getInstalledVersionSync(): InstalledVersion {
  if (cached) return cached;
  const platform = typeof window !== "undefined" ? ((window as any).Capacitor?.getPlatform?.() ?? "web") : "web";
  return configVersion(platform);
}

export async function loadInstalledVersion(): Promise<InstalledVersion> {
  if (cached) return cached;
  try {
    const { Capacitor } = await import("@capacitor/core");
    const platform = Capacitor.getPlatform();
    if (Capacitor.isNativePlatform()) {
      const { App } = await import("@capacitor/app");
      const parsed = parseNativeAppInfo(await App.getInfo(), platform);
      if (parsed) return (cached = parsed);
    }
    return (cached = configVersion(platform));
  } catch {
    return getInstalledVersionSync();
  }
}

/** "10.0.03 (103)" — single readable form for diagnostics. */
export function versionLabel(v: InstalledVersion): string {
  return v.build === null ? v.version : `${v.version} (${v.build})`;
}

// ── Local version-change history (kept on the phone; last 10 changes) ──
export const VERSION_HISTORY_KEY = "worker_app_version_history_v1";
export interface VersionHistoryEntry { version: string; build: number | null; at: number }

interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function recordVersionChange(store: KV, current: InstalledVersion, now: number): {
  changed: boolean; firstLaunch: boolean; previous: VersionHistoryEntry | null; history: VersionHistoryEntry[];
} {
  let history: VersionHistoryEntry[] = [];
  try {
    const v = JSON.parse(store.getItem(VERSION_HISTORY_KEY) || "[]");
    if (Array.isArray(v)) history = v.filter((e) => e && typeof e.version === "string");
  } catch { /* corrupt → start fresh */ }
  const last = history[history.length - 1] ?? null;
  const changed = !last || last.version !== current.version || last.build !== current.build;
  if (changed) {
    history = [...history, { version: current.version, build: current.build, at: now }].slice(-10);
    try { store.setItem(VERSION_HISTORY_KEY, JSON.stringify(history)); } catch { /* storage full */ }
  }
  return { changed, firstLaunch: !last, previous: changed ? last : history[history.length - 2] ?? null, history };
}
