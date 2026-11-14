import { acceptanceMs, isReminderEligible, type StartOtpReminderBooking } from "./startOtpReminder";

export const START_OTP_ALARM_OFFSETS = [10, 15, 20] as const;
export type StartAlarmPhase = "waiting" | "first" | "second" | "continuous" | "stopped";

export function startAlarmPhase(b: StartOtpReminderBooking, workerId: string | null, serverNow: number): StartAlarmPhase {
  if (!isReminderEligible(b, workerId)) return "stopped";
  const accepted = acceptanceMs(b);
  if (accepted === null) return "stopped";
  const elapsed = serverNow - accepted;
  if (elapsed >= 20 * 60_000) return "continuous";
  if (elapsed >= 15 * 60_000) return "second";
  if (elapsed >= 10 * 60_000) return "first";
  return "waiting";
}

/** Completion speech must yield to any pending Start OTP, not just an audible player. */
export function completionReminderAllowed(startRequired: boolean | null, startedAt: string | null): boolean {
  return startRequired !== true || Boolean(startedAt);
}