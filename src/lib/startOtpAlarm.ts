import { acceptanceMs, isReminderEligible, type StartOtpReminderBooking } from "./startOtpReminder";
import { START_ALLOWED_STATUSES } from "./startOtp";

export const START_OTP_ALARM_OFFSETS = [10, 15] as const;
export type StartAlarmPhase = "waiting" | "first" | "continuous" | "stopped";

export function startAlarmPhase(b: StartOtpReminderBooking, workerId: string | null, serverNow: number): StartAlarmPhase {
  if (!isReminderEligible(b, workerId)) return "stopped";
  const accepted = acceptanceMs(b);
  if (accepted === null) return "stopped";
  const elapsed = serverNow - accepted;
  if (elapsed >= 15 * 60_000) return "continuous";
  if (elapsed >= 10 * 60_000) return "first";
  return "waiting";
}

/** Completion speech must yield to any pending Start OTP, not just an audible player. */
export function completionReminderAllowed(startRequired: boolean | null, startedAt: string | null): boolean {
  return startRequired !== true || Boolean(startedAt);
}

/** Completion speech for another job must also yield to this worker's pending Start. */
export function hasPendingStartOtp(bookings: readonly { status: string | null; start_otp_required: boolean | null; started_at: string | null }[]): boolean {
  return bookings.some(b => b.start_otp_required === true && !b.started_at
    && (START_ALLOWED_STATUSES as readonly string[]).includes(b.status ?? ""));
}