const DISPATCH_WINDOW_MINUTES = 10;

type ScheduleInput = {
  id?: string | null;
  bookingId?: string | null;
  booking_type?: string | null;
  bookingType?: string | null;
  prealert_sent?: boolean | null;
  prealertSent?: boolean | null;
  status?: string | null;
  request_status?: string | null;
  requestStatus?: string | null;
  scheduled_date?: string | null;
  scheduledDate?: string | null;
  scheduled_time?: string | null;
  scheduledTime?: string | null;
};

export type ScheduledOfferLogSource = "fcm" | "poll" | "realtime" | "query" | "heartbeat" | "resume" | "recovery";

export function getScheduledAt(input: ScheduleInput): Date | null {
  const date = input.scheduled_date ?? input.scheduledDate;
  const time = input.scheduled_time ?? input.scheduledTime;
  if (!date || !time) return null;

  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const scheduledAt = new Date(`${date}T${normalizedTime}`);
  return Number.isNaN(scheduledAt.getTime()) ? null : scheduledAt;
}

export function getMinutesUntilScheduled(input: ScheduleInput, now = new Date()): number | null {
  const scheduledAt = getScheduledAt(input);
  if (!scheduledAt) return null;
  return Math.round((scheduledAt.getTime() - now.getTime()) / 60_000);
}

export function isScheduledBooking(input: ScheduleInput): boolean {
  return (input.booking_type ?? input.bookingType) === "scheduled" || !!getScheduledAt(input);
}

export function isBeforeScheduledDispatchWindow(input: ScheduleInput, now = new Date()): boolean {
  const minutesUntilScheduled = getMinutesUntilScheduled(input, now);
  return minutesUntilScheduled !== null && minutesUntilScheduled > DISPATCH_WINDOW_MINUTES;
}

export function canShowWorkerBookingOffer(input: ScheduleInput): boolean {
  if (!isScheduledBooking(input)) return true;
  return (input.prealert_sent ?? input.prealertSent) === true;
}

export function logScheduledOfferDecision(
  input: ScheduleInput,
  source: ScheduledOfferLogSource,
  shownToWorker: boolean,
  now = new Date()
) {
  const scheduledAt = getScheduledAt(input);
  console.log("[ScheduledOfferGuard]", {
    booking_id: input.bookingId ?? input.id ?? null,
    booking_type: input.booking_type ?? input.bookingType ?? (scheduledAt ? "scheduled" : "instant"),
    scheduled_at: scheduledAt?.toISOString() ?? null,
    prealert_sent: input.prealert_sent ?? input.prealertSent ?? null,
    request_status: input.request_status ?? input.requestStatus ?? input.status ?? null,
    current_time: now.toISOString(),
    minutes_until_scheduled: getMinutesUntilScheduled(input, now),
    source,
    shown_to_worker: shownToWorker,
  });
}

export { DISPATCH_WINDOW_MINUTES };