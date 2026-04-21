/**
 * Activity Recognition (motion / step) permission helper.
 *
 * Wraps the existing native StepCounter plugin so we can request
 * ACTIVITY_RECOGNITION at app startup instead of waiting until the
 * worker accepts their first booking.
 *
 * Android version notes:
 *  - API 29+ (Android 10+): runtime permission is required.
 *  - API < 29: auto-granted at install time, no prompt needed.
 *  - Web / iOS: no-op.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

interface StepCounterPlugin {
  checkSupport(): Promise<{ supported: boolean; sensorType: string }>;
  requestPermission(): Promise<{ granted: boolean }>;
}

let plugin: StepCounterPlugin | null = null;
function getPlugin(): StepCounterPlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  if (Capacitor.getPlatform() !== "android") return null;
  if (!plugin) {
    try {
      plugin = registerPlugin<StepCounterPlugin>("StepCounter");
    } catch {
      return null;
    }
  }
  return plugin;
}

let requestInFlight: Promise<boolean> | null = null;

/**
 * Request ACTIVITY_RECOGNITION permission from the user.
 * - Android-only, no-op on web/iOS.
 * - Deduped: if a request is already in flight, returns the same promise.
 * - Never throws — always resolves to true/false.
 */
export async function requestActivityRecognitionPermission(): Promise<boolean> {
  const p = getPlugin();
  if (!p) {
    console.log("[Movement] Skipping activity permission (not Android native)");
    return false;
  }

  if (requestInFlight) {
    console.log("[Movement] Permission request already in-flight, awaiting...");
    return requestInFlight;
  }

  requestInFlight = (async () => {
    try {
      // checkSupport first — no point asking on devices with no step sensor
      const support = await p.checkSupport().catch(() => null);
      if (!support?.supported) {
        console.log(
          "[Movement] Device has no step sensor — skipping permission prompt"
        );
        return false;
      }

      console.log(
        `[Movement] Requesting ACTIVITY_RECOGNITION permission (sensor: ${support.sensorType})`
      );
      console.log("[Movement] 🟦 Calling native StepCounter.requestPermission()...");
      const { granted } = await p.requestPermission();
      console.log("[Movement] Native StepCounter.requestPermission resolved:", granted);
      // NOTE: Returning false here is the normal "user denied" outcome.
      // Do NOT throw — throwing would surface a "Couldn't open settings" toast
      // even though the OS prompt did appear correctly.
      return granted;
    } catch (e) {
      // Only true plugin/bridge failures reach this catch (e.g. missing plugin)
      console.error("[Movement] ❌ Activity permission request failed:", e);
      return false;
    } finally {
      requestInFlight = null;
    }
  })();

  return requestInFlight;
}
