import { isVillaCommunity } from "@/lib/communityTypes";
import { formatVillaLabel } from "@/lib/address";
import type { BookingAlert } from "@/services/bookingAlertCoordinator";

/**
 * Pure: builds the data the in-app path hands to the native booking pop-up.
 * The pop-up's countdown must use the SAME server expiry as the FCM path, and
 * an offer whose server window has passed must never open as actionable.
 * Returns null when the offer has already expired (caller shows nothing).
 * Display/transport only — never decides assignment.
 */
export function buildNativeOverlayPayload(alert: BookingAlert, nowMs: number = Date.now()): string | null {
  const timeoutMs = alert.timeoutAt ? Date.parse(alert.timeoutAt) : NaN;
  if (Number.isFinite(timeoutMs) && timeoutMs <= nowMs) return null;
  const villa = isVillaCommunity(alert.community);
  return JSON.stringify({
    id: alert.bookingId,
    booking_request_id: alert.bookingRequestId ?? "",
    cust_name: alert.custName,
    community: alert.community,
    service_type: alert.serviceType,
    flat_no: alert.flatNo,
    is_villa: villa,
    unit_label: villa ? formatVillaLabel(alert.flatNo) : `Flat #${alert.flatNo}`,
    price_inr: alert.priceInr,
    booking_type: alert.bookingType,
    scheduled_date: alert.scheduledDate,
    scheduled_time: alert.scheduledTime,
    prealert_sent: alert.prealertSent === true,
    // Epoch seconds; 0 = unknown (native falls back to its own TTL rules).
    expires_at: Number.isFinite(timeoutMs) ? Math.floor(timeoutMs / 1000) : 0,
    ...(alert.ackToken ? { ack_token: alert.ackToken } : {}),
  });
}

/** Pure: true when the offer's server window has already closed. */
export function isAlertExpired(alert: Pick<BookingAlert, "timeoutAt">, nowMs: number = Date.now()): boolean {
  const t = alert.timeoutAt ? Date.parse(alert.timeoutAt) : NaN;
  return Number.isFinite(t) && t <= nowMs;
}
