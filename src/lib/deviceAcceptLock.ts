import { Capacitor } from "@capacitor/core";
import { beginAcceptance, endAcceptance } from "@/services/bookingAlertCoordinator";

/**
 * One acceptance attempt at a time on this phone, shared by every surface:
 * the in-app booking card (JS), the Android pop-up over other apps and the
 * full-screen locked-phone alert (native `OfferQueue` claim).
 *
 * This only prevents duplicate requests. The server still decides the winner.
 */
interface NativeAcceptLock {
  claimAcceptance?: (opts: { bookingId: string }) => Promise<{ claimed?: boolean }>;
  releaseAcceptance?: (opts: { bookingId: string; accepted?: boolean }) => Promise<void>;
}

function nativeLock(): NativeAcceptLock | null {
  try {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return null;
    const plugin = (window as unknown as { Capacitor?: { Plugins?: { OverlayPlugin?: NativeAcceptLock } } })
      .Capacitor?.Plugins?.OverlayPlugin;
    return plugin?.claimAcceptance ? plugin : null;
  } catch {
    return null;
  }
}

/** Returns true when THIS caller now owns the single acceptance attempt. */
export async function claimDeviceAcceptance(bookingId: string): Promise<boolean> {
  if (!beginAcceptance(bookingId)) return false;
  const lock = nativeLock();
  if (!lock?.claimAcceptance) return true;
  try {
    const res = await lock.claimAcceptance({ bookingId });
    if (res?.claimed === false) {
      // The native pop-up/full-screen alert is already accepting this booking.
      endAcceptance(bookingId);
      return false;
    }
    return true;
  } catch {
    // Older Android build without the shared claim: keep the JS lock only.
    return true;
  }
}

/** Releases both claims. `accepted` records a confirmed win on the native side too. */
export async function releaseDeviceAcceptance(bookingId: string, accepted = false): Promise<void> {
  // The attempt is finished on either result; confirmed ownership is tracked separately.
  endAcceptance(bookingId);
  const lock = nativeLock();
  if (!lock?.releaseAcceptance) return;
  try {
    await lock.releaseAcceptance({ bookingId, accepted });
  } catch {
    /* ignore — the native claim also expires on its own */
  }
}
