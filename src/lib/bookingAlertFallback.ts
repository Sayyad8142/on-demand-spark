import { Capacitor } from "@capacitor/core";

/**
 * Backup alert used when the native booking pop-up could not be opened
 * (blocked background start, missing overlay permission, plugin error).
 * Posts a normal notification on the existing high-priority booking channel
 * so the worker still hears and sees the offer. Never throws.
 */
export const BOOKING_FALLBACK_CHANNEL = "booking_alerts";

/** Stable positive 31-bit id per booking so repeats replace, not stack. */
export function fallbackNotificationId(bookingId: string): number {
  let h = 0;
  for (let i = 0; i < bookingId.length; i++) h = (h * 31 + bookingId.charCodeAt(i)) | 0;
  return (Math.abs(h) % 2_000_000_000) + 1;
}

export async function postBookingAlertFallback(alert: {
  bookingId: string;
  bookingRequestId?: string;
}): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({
      notifications: [
        {
          id: fallbackNotificationId(alert.bookingId),
          title: "New Booking",
          body: "Tap to open",
          channelId: BOOKING_FALLBACK_CHANNEL,
          extra: { kind: "booking_alert_fallback", bookingId: alert.bookingId, bookingRequestId: alert.bookingRequestId ?? null },
        },
      ],
    });
    return true;
  } catch (e) {
    console.warn("[BookingAlert] fallback notification failed", e instanceof Error ? e.message : e);
    return false;
  }
}

export async function clearBookingAlertFallback(bookingId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [{ id: fallbackNotificationId(bookingId) }] });
  } catch {
    /* ignore */
  }
}
