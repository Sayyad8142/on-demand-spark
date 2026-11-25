import { acceptanceMs, cardIndicator, START_OTP_REMINDER_FIRST_MIN, type StartOtpReminderBooking } from "./startOtpReminder";

type PendingStart = Omit<StartOtpReminderBooking, "worker_id">;
/** Display-only deadline; never authorizes OTP or stops reminders. */
export function startOtpCountdown(booking: PendingStart, now = Date.now()): number | null {
  if (cardIndicator(booking, now) === "none") return null;
  const accepted = acceptanceMs({ ...booking, worker_id: "self" });
  if (accepted === null) return null;
  return Math.min(600, Math.max(0, Math.ceil((accepted + START_OTP_REMINDER_FIRST_MIN * 60_000 - now) / 1000)));
}

export function countdownLabel(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export type ChargeKind = "dishes" | "surge" | "surcharge" | "glass";
type ChargeBooking = {
  dish_intensity_extra_inr?: number | null; slot_surge_amount?: number | null;
  surcharge_amount?: number | null; surcharge_reason?: string | null; glass_partition_fee?: number | null;
};
/** Stored components only: never derive add-ons from a total or guess their reason. */
export function bookingCharges(b: ChargeBooking): { kind: ChargeKind; label: string; amount: number }[] {
  return [
    { kind: "dishes" as const, label: "Extra Dishes", amount: b.dish_intensity_extra_inr },
    { kind: "surge" as const, label: "Surge Charge", amount: b.slot_surge_amount },
    { kind: "surcharge" as const, label: b.surcharge_reason?.trim() || "Additional Charge", amount: b.surcharge_amount },
    { kind: "glass" as const, label: "Glass Partition", amount: b.glass_partition_fee },
  ].filter((c): c is { kind: ChargeKind; label: string; amount: number } => typeof c.amount === "number" && Number.isFinite(c.amount) && c.amount > 0);
}
export type StartTimerTone = "green" | "orange" | "red";
export type StartTimer = { overdue: boolean; seconds: number; progress: number; tone: StartTimerTone };

/**
 * Display-only Start countdown from the server acceptance time (+10 min deadline).
 * Never restarts on refresh; null once started/cancelled/not a Start OTP booking.
 */
export function startOtpTimer(booking: PendingStart, now = Date.now(), serverDeadlineAt?: string | null, rule?: DeadlineRule): StartTimer | null {
  if (cardIndicator(booking, now) === "none") return null;
  const accepted = acceptanceMs({ ...booking, worker_id: "self" });
  if (accepted === null) return null;
  const total = START_OTP_REMINDER_FIRST_MIN * 60;
  const deadline = startDeadlineMs(accepted, trustedServerDeadline(serverDeadlineAt, rule));
  const left = Math.ceil((deadline - now) / 1000);
  if (left <= 0) return { overdue: true, seconds: Math.floor((now - deadline) / 1000), progress: 0, tone: "red" };
  const seconds = Math.min(total, left);
  return { overdue: false, seconds, progress: seconds / total, tone: seconds > 300 ? "green" : seconds >= 120 ? "orange" : "red" };
}

/**
 * Server-confirmed Start deadline (`get_my_late_start_status.deadline_at`) when available,
 * otherwise acceptance + 10 min (the same anchor the 10/15/20-minute alarms use).
 */
export function startDeadlineMs(acceptedMs: number, serverDeadlineAt?: string | null): number {
  const server = serverDeadlineAt ? Date.parse(serverDeadlineAt) : NaN;
  return Number.isFinite(server) && server > 0 ? server : acceptedMs + START_OTP_REMINDER_FIRST_MIN * 60_000;
}

/** MM:SS, growing to H:MM:SS for long overdue times. */
export function timerLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** First server rule version whose deadline_at follows "later of acceptance or scheduled start, + 10 min" for scheduled bookings. */
export const SCHEDULED_DEADLINE_RULE_VERSION = 2;
export type DeadlineRule = { bookingType?: string | null; ruleVersion?: number | null };
/**
 * Whether the server's deadline_at may drive the countdown. Instant: always (acceptance + 10 min).
 * Scheduled: only once Admin returns the corrected deadline_rule_version; until then the existing
 * behaviour is kept unchanged instead of trusting the old acceptance-only rule.
 */
export function trustedServerDeadline(serverDeadlineAt: string | null | undefined, rule?: DeadlineRule): string | null {
  if (!serverDeadlineAt) return null;
  if (rule?.bookingType === "scheduled" && !((rule.ruleVersion ?? 0) >= SCHEDULED_DEADLINE_RULE_VERSION)) return null;
  return serverDeadlineAt;
}

export type DeadlineAlarmPhase = "waiting" | "first" | "second" | "continuous";
/** Milestones relative to a server deadline: first at deadline, second +5 min, continuous from +10 min. */
export function alarmPhaseFromDeadline(deadlineMs: number, serverNow: number): DeadlineAlarmPhase {
  const late = serverNow - deadlineMs;
  if (late >= 10 * 60_000) return "continuous";
  if (late >= 5 * 60_000) return "second";
  if (late >= 0) return "first";
  return "waiting";
}
