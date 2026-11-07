/**
 * Booking acceptance outside operating hours (7:00 AM – 7:00 PM IST).
 *
 * The backend refuses late acceptances by raising PostgreSQL P0001 with a
 * message starting "BOOKING_ACCEPTANCE_CLOSED:". This module only recognises
 * that answer; the server stays the sole authority on hours.
 */
export const ACCEPTANCE_CLOSED_PREFIX = "BOOKING_ACCEPTANCE_CLOSED:";
export const ACCEPTANCE_CLOSED_MESSAGE =
  "Booking acceptance is closed. Didi Now operates from 7:00 AM to 7:00 PM.";

type MaybePgError = { code?: string | null; message?: string | null } | null | undefined;

/** True only for the exact backend answer: P0001 + prefixed message. */
export function isAcceptanceClosedError(err: MaybePgError): boolean {
  if (!err || err.code !== "P0001") return false;
  return typeof err.message === "string" && err.message.trim().startsWith(ACCEPTANCE_CLOSED_PREFIX);
}
