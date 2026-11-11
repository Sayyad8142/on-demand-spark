/**
 * Startup / crash / update event log. Kept on the phone (last 100 events) and only
 * sent to the server once APP_HEALTH_SERVER_SYNC_ENABLED is turned on after the staged
 * `log_worker_app_event` function is approved and live. Never records tokens, OTPs,
 * phone numbers or customer details: messages are trimmed and scrubbed.
 */
export const APP_HEALTH_SERVER_SYNC_ENABLED = false;
export const APP_HEALTH_KEY = "worker_app_health_log_v1";
export const APP_HEALTH_MAX = 100;

export type AppHealthEvent =
  | "app_start" | "app_mounted" | "first_launch_after_update" | "js_error" | "unhandled_rejection"
  | "update_prompt_shown" | "update_tapped" | "update_later" | "update_deferred"
  | "ota_rejected" | "ota_waiting" | "ota_download_failed" | "ota_applied" | "ota_rolled_back";

export interface AppHealthEntry { event: AppHealthEvent; at: number; version: string; build: number | null; detail?: string }

/** Removes anything that looks like a secret or personal number, then trims. */
export function scrubDetail(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  let s = typeof raw === "string" ? raw : raw instanceof Error ? `${raw.name}: ${raw.message}` : String(raw);
  s = s
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[jwt]")
    .replace(/[A-Za-z0-9_\-:]{60,}/g, "[token]")
    .replace(/\+?\d[\d\s-]{7,}\d/g, "[number]")
    .replace(/\b\d{3,6}\b/g, "[digits]");
  return s.slice(0, 200);
}

interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function readHealthLog(store: KV): AppHealthEntry[] {
  try { const v = JSON.parse(store.getItem(APP_HEALTH_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function appendHealthEvent(store: KV, entry: AppHealthEntry): AppHealthEntry[] {
  const next = [...readHealthLog(store), { ...entry, detail: scrubDetail(entry.detail) }].slice(-APP_HEALTH_MAX);
  try { store.setItem(APP_HEALTH_KEY, JSON.stringify(next)); } catch { /* full */ }
  return next;
}

/** Fire-and-forget; never throws. */
export function logAppHealth(event: AppHealthEvent, detail?: unknown): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    // Lazy import keeps this module dependency-free for tests.
    import("@/lib/installedVersion").then(({ getInstalledVersionSync }) => {
      const v = getInstalledVersionSync();
      appendHealthEvent(window.localStorage, { event, at: Date.now(), version: v.version, build: v.build, detail: detail as string });
    }).catch(() => {});
  } catch { /* never break the app */ }
}

let installed = false;
/** Captures uncaught errors and promise rejections (message only, scrubbed). */
export function installCrashCapture(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => logAppHealth("js_error", e?.message ?? "error"));
  window.addEventListener("unhandledrejection", (e) => logAppHealth("unhandled_rejection", (e as PromiseRejectionEvent)?.reason));
}
