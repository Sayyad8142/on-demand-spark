/**
 * When is it safe to interrupt the worker with an update (prompt, OTA reload, blocking screen)?
 * Pure, display-only rules. Never changes bookings, availability, OTP or dispatch.
 *
 * Unsafe: an offer on screen (60-second countdown / Accept in flight), any active booking
 * (accepted, travelling, started, in progress), the Start/End OTP screens, or booking state
 * not loaded yet (unknown counts as busy).
 */
export const ACTIVE_WORK_STATUSES = ["assigned", "accepted", "on_the_way", "started", "in_progress"] as const;

/** Screens where an update must never interrupt (Start OTP, End OTP / completion). */
export const PROTECTED_ROUTE_PREFIXES = ["/start-booking/", "/complete-booking/"] as const;

export type WorkBlockReason = "booking_loading" | "offer" | "active_booking" | "otp_screen";

export interface WorkState {
  /** False until the active-booking lookup has finished at least once. */
  bookingLoaded: boolean;
  activeBookingStatus?: string | null;
  offerVisible?: boolean;
  pathname?: string | null;
}

export function isActiveWorkStatus(status: string | null | undefined): boolean {
  return !!status && (ACTIVE_WORK_STATUSES as readonly string[]).includes(status);
}

export function isProtectedRoute(pathname: string | null | undefined): boolean {
  return !!pathname && PROTECTED_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));
}

/** First reason the worker must not be interrupted, or null when it is safe. */
export function workBlockReason(s: WorkState): WorkBlockReason | null {
  if (s.offerVisible) return "offer";
  if (isProtectedRoute(s.pathname)) return "otp_screen";
  if (!s.bookingLoaded) return "booking_loading";
  if (isActiveWorkStatus(s.activeBookingStatus)) return "active_booking";
  return null;
}

export function isSafeToInterrupt(s: WorkState): boolean {
  return workBlockReason(s) === null;
}
