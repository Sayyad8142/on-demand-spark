/**
 * Start-up telemetry: crash capture, the real installed version, and a
 * "first launch after update" marker. Local only (see appHealthLog). Never throws.
 */
import { installCrashCapture, logAppHealth } from "@/lib/appHealthLog";
import { loadInstalledVersion, recordVersionChange } from "@/lib/installedVersion";

export async function startBootTelemetry(): Promise<void> {
  try {
    installCrashCapture();
    const v = await loadInstalledVersion();
    logAppHealth("app_start", v.source);
    const r = recordVersionChange(window.localStorage, v, Date.now());
    if (r.changed && !r.firstLaunch && r.previous) {
      logAppHealth("first_launch_after_update", `${r.previous.version}→${v.version}`);
    }
  } catch { /* never block start-up */ }
}
