/**
 * Pure rules for what the app does after an Accept attempt.
 *
 * The server (`try_accept_booking`) is the only authority for who wins a
 * booking. These rules only decide what THIS phone shows next:
 *  - won     → keep the booking (backend confirmed us)
 *  - closed  → outside operating hours; close the offer, never retry
 *  - gone    → taken by someone else / expired / no longer offered; close it
 *  - retry   → temporary problem (network, session, unknown); keep the offer
 *              open so the worker can tap Accept again while it is still valid
 */
export type AcceptOutcome = "won" | "closed" | "gone" | "retry";

export interface AcceptResultLike {
  success: boolean;
  error?: string;
  acceptanceClosed?: boolean;
}

const GONE_PATTERNS: RegExp[] = [
  /already/i,          // already accepted / already assigned / already taken
  /taken/i,
  /expired/i,
  /no longer/i,
  /not available/i,
  /unavailable/i,
  /not pending/i,
  /not open/i,         // "Scheduled booking is not open for acceptance yet."
  /assigned/i,
  /cancel/i,
  /not found/i,
  /closed/i,
  /not eligible/i,
  /not offered/i,
];

export function classifyAcceptResult(result: AcceptResultLike): AcceptOutcome {
  if (result.success) return "won";
  if (result.acceptanceClosed) return "closed";
  const msg = (result.error ?? "").trim();
  if (!msg) return "retry";
  if (GONE_PATTERNS.some((re) => re.test(msg))) return "gone";
  return "retry";
}

/**
 * A retry is only allowed while the server's acceptance window is open.
 * Unknown timeout → allowed (the server will refuse if it is not).
 * Never extends an expired offer.
 */
export function canRetryAccept(timeoutAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!timeoutAt) return true;
  const t = new Date(timeoutAt).getTime();
  if (Number.isNaN(t)) return true;
  return t > now;
}
