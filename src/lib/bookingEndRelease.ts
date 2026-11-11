import { Capacitor } from "@capacitor/core";
import { ACTIVE_WORK_STATUSES } from "@/lib/workSafety";

/**
 * Releasing the phone's local "busy" alert lock after the SERVER says a booking
 * has ended for this worker (completed, cancelled, or no longer assigned).
 *
 * Display-only: this never calls the server, never changes the assignment and
 * never changes dispatch eligibility. Native side releases only when the ended
 * booking matches the one this phone accepted.
 */

type ServerBooking = { id?: string | null; status?: string | null; worker_id?: string | null } | null | undefined;

const ACTIVE = ACTIVE_WORK_STATUSES as readonly string[];

/** A realtime update for MY booking whose server status is no longer active work. */
export function endedBookingIdFromUpdate(booking: ServerBooking, myWorkerId: string | null | undefined): string | null {
  if (!booking?.id || !booking.status || !myWorkerId) return null;
  if (booking.worker_id !== myWorkerId) return null;
  return ACTIVE.includes(booking.status) ? null : booking.id;
}

/**
 * A successful re-read that found NO active work at all ends the previously
 * confirmed booking. A different active booking is NOT treated as an ending.
 */
export function endedBookingIdFromRefetch(previousId: string | null | undefined, fetched: ServerBooking, fetchSucceeded: boolean): string | null {
  if (!fetchSucceeded || !previousId) return null;
  return fetched ? null : previousId;
}

interface NativeEndRelease {
  releaseEndedBooking?: (opts: { bookingId: string }) => Promise<void>;
}

/** Fire-and-forget; older Android builds without the method simply keep their 10-minute expiry. */
export function releaseNativeBookingLock(bookingId: string | null | undefined): void {
  if (!bookingId) return;
  try {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
    const plugin = (window as unknown as { Capacitor?: { Plugins?: { OverlayPlugin?: NativeEndRelease } } })
      .Capacitor?.Plugins?.OverlayPlugin;
    plugin?.releaseEndedBooking?.({ bookingId })?.catch?.(() => {});
  } catch {
    /* never block the booking screens */
  }
}
