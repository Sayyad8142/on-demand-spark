/**
 * Start OTP voice reminder — pure rules (no side effects).
 *
 * Reminders: 10 min after acceptance, then every 5 min, last one at 120 min.
 * Only the server's `started_at` (set by verify_start_otp) counts as verified;
 * typed-but-unverified codes never stop reminders. Display/notification only —
 * never changes booking, OTP, dispatch, payment or availability data.
 */
import { START_ALLOWED_STATUSES } from "@/lib/startOtp";

export const START_OTP_REMINDER_FIRST_MIN = 10;
export const START_OTP_REMINDER_INTERVAL_MIN = 5;
export const START_OTP_REMINDER_STOP_MIN = 120;
export const START_OTP_ADMIN_FOLLOW_UP_MIN = 20;
export const START_OTP_ADMIN_URGENT_MIN = 120;
export const START_OTP_REMINDER_CHANNEL = "start_otp_reminder_v1";
export const START_OTP_REMINDER_SOUND = "start_otp_voice.mp3";
export const START_OTP_REMINDER_KIND = "start_otp_reminder";

const MIN = 60_000;

export type StartOtpReminderBooking = {
  id: string;
  status: string | null;
  worker_id: string | null;
  start_otp_required: boolean | null;
  started_at: string | null;
  accepted_at: string | null;
  assigned_at?: string | null;
};

/** Acceptance time in ms (accepted_at, else assigned_at for admin assignment). */
export function acceptanceMs(b: StartOtpReminderBooking): number | null {
  const raw = b.accepted_at ?? b.assigned_at ?? null;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) && t > 0 ? t : null;
}

export function isReminderEligible(b: StartOtpReminderBooking, workerId: string | null | undefined): boolean {
  if (!workerId || b.worker_id !== workerId) return false;
  if (b.start_otp_required !== true) return false;
  if (b.started_at) return false;
  if (!(START_ALLOWED_STATUSES as readonly string[]).includes(b.status ?? "")) return false;
  return acceptanceMs(b) !== null;
}

/** All reminder offsets in minutes: 10, 15, …, 120 (23 reminders). */
export function reminderOffsetsMin(): number[] {
  const out: number[] = [];
  for (let m = START_OTP_REMINDER_FIRST_MIN; m <= START_OTP_REMINDER_STOP_MIN; m += START_OTP_REMINDER_INTERVAL_MIN) out.push(m);
  return out;
}

export type PlannedReminder = { id: number; index: number; at: number };

/** Stable positive 31-bit hash of the booking id. */
export function bookingHash(bookingId: string): number {
  let h = 2166136261;
  for (let i = 0; i < bookingId.length; i++) {
    h ^= bookingId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 40_000_000;
}

/** Deterministic notification id per booking + reminder index (no duplicates). */
export function reminderNotificationId(bookingId: string, index: number): number {
  return 1_000_000_000 + bookingHash(bookingId) * 25 + index;
}

/** Future reminders only (past ones are never back-filled). */
export function planReminders(b: StartOtpReminderBooking, workerId: string | null | undefined, nowMs: number): PlannedReminder[] {
  if (!isReminderEligible(b, workerId)) return [];
  const accepted = acceptanceMs(b)!;
  return reminderOffsetsMin()
    .map((m, index) => ({ id: reminderNotificationId(b.id, index), index, at: accepted + m * MIN }))
    .filter((r) => r.at > nowMs + 1000);
}

export type StartOtpIndicator = "none" | "pending" | "delayed";

export function startOtpIndicator(b: StartOtpReminderBooking, workerId: string | null | undefined, nowMs: number): StartOtpIndicator {
  if (!isReminderEligible(b, workerId)) return "none";
  return nowMs - acceptanceMs(b)! >= START_OTP_REMINDER_FIRST_MIN * MIN ? "delayed" : "pending";
}

/** Same as startOtpIndicator but without a worker check (card already shows the worker's own booking). */
export function cardIndicator(b: Omit<StartOtpReminderBooking, "worker_id">, nowMs: number): StartOtpIndicator {
  return startOtpIndicator({ ...b, worker_id: "self" }, "self", nowMs);
}

export type AdminFlagLevel = "none" | "follow_up" | "urgent";

/** Proposed server-side admin flag (mirrored in the backend handoff, display-only here). */
export function adminFlagLevel(b: StartOtpReminderBooking, nowMs: number): AdminFlagLevel {
  if (b.start_otp_required !== true || b.started_at) return "none";
  if (!(START_ALLOWED_STATUSES as readonly string[]).includes(b.status ?? "")) return "none";
  const a = acceptanceMs(b);
  if (a === null) return "none";
  const mins = (nowMs - a) / MIN;
  if (mins >= START_OTP_ADMIN_URGENT_MIN) return "urgent";
  if (mins >= START_OTP_ADMIN_FOLLOW_UP_MIN) return "follow_up";
  return "none";
}

/** Diff pending notifications vs. wanted ones. */
export function diffReminders(pendingIds: number[], wanted: PlannedReminder[]): { cancel: number[]; schedule: PlannedReminder[] } {
  const wantedIds = new Set(wanted.map((w) => w.id));
  const pending = new Set(pendingIds);
  return {
    cancel: pendingIds.filter((id) => !wantedIds.has(id)),
    schedule: wanted.filter((w) => !pending.has(w.id)),
  };
}
