import {
  isOtpV2ClientEnabled,
  isOtpV2Failure,
  verifyCompletionOtp,
  type OtpV2ErrorCode,
} from "@/lib/otpV2";

/**
 * Decide how a Completion OTP submission is handled.
 *
 * - Client V2 off → legacy completion (the original, pre-V2 behavior).
 * - Client V2 on  → the V2 gateway is always asked first. The legacy path is
 *   allowed ONLY when this very gateway answer is LEGACY_BOOKING. Cached
 *   modes, 404s, unavailability, network errors, timeouts, auth failures,
 *   wrong codes, lockouts and every other error never reach legacy.
 */
export type CompletionDecision =
  | { path: "legacy" }
  | { path: "v2_completed"; idempotent: boolean }
  | { path: "v2_error"; code: OtpV2ErrorCode; message: string };

export async function decideCompletion(
  bookingId: string,
  otp: string,
  v2Enabled: boolean = isOtpV2ClientEnabled(),
): Promise<CompletionDecision> {
  if (!v2Enabled) return { path: "legacy" };

  const result = await verifyCompletionOtp(bookingId, otp);
  if (!isOtpV2Failure(result)) {
    if (result.status === "completed") return { path: "v2_completed", idempotent: result.idempotent };
    return { path: "v2_error", code: "OTP_V2_OPERATION_FAILED", message: "Unexpected response. Please try again." };
  }
  if (result.code === "LEGACY_BOOKING") return { path: "legacy" };
  return { path: "v2_error", code: result.code, message: result.message };
}

/** Error codes after which the completion/start screen should close. */
export const TERMINAL_CODES: readonly OtpV2ErrorCode[] = [
  "NOT_CURRENT_ASSIGNMENT",
  "TERMINAL_BOOKING",
  "BOOKING_NOT_FOUND",
];

/** Error codes the worker may simply retry (same code, no lockout impact). */
export const RETRYABLE_CODES: readonly OtpV2ErrorCode[] = [
  "NETWORK",
  "TIMEOUT",
  "OTP_V2_UNAVAILABLE",
  "OTP_V2_OPERATION_FAILED",
];
