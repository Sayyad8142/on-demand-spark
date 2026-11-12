import type { BookingAlert } from '@/services/bookingAlertCoordinator';

const text = (...values: unknown[]): string | undefined =>
  values.find((v): v is string => typeof v === 'string' && v.length > 0);

function epochMs(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const numeric = Number(value);
  const ms = Number.isFinite(numeric) && numeric > 0
    ? numeric > 100_000_000_000 ? numeric : numeric * 1000
    : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) && ms > 0 && ms < 8.64e15 ? ms : undefined;
}

/** Absolute wire deadline only: never start a fresh TTL on receipt or tap. */
export function fcmOfferDeadline(data: Record<string, unknown>): string | undefined {
  const explicit = data.expires_at ?? data.timeout_at ?? data.timeoutAt;
  let ms = epochMs(explicit);
  if (explicit != null && ms == null) return undefined;
  if (ms == null) {
    const sent = epochMs(data.sent_at);
    const ttl = Number(data.ttl_seconds ?? 60);
    if (sent != null && Number.isInteger(ttl) && ttl >= 1 && ttl <= 600) ms = sent + ttl * 1000;
  }
  return ms == null ? undefined : new Date(ms).toISOString();
}

/** Shared foreground/tap contract; other message types cannot become offers. */
export function parseFcmOffer(data: Record<string, unknown>, now = Date.now()): BookingAlert | null {
  if (data.type !== 'BOOKING_ALERT' || String(data.actionable ?? 'true').toLowerCase() === 'false') return null;
  const bookingId = text(data.bookingId, data.booking_id);
  const timeoutAt = fcmOfferDeadline(data);
  if (!bookingId || !timeoutAt || Date.parse(timeoutAt) <= now) return null;
  const rawPrice = text(data.price_inr, data.priceInr, data.price) ?? String(data.price_inr ?? data.priceInr ?? data.price ?? 0);
  const price = Number(rawPrice.replace(/[₹,\s]/g, ''));
  return {
    bookingId,
    bookingRequestId: text(data.booking_request_id, data.bookingRequestId),
    custName: text(data.cust_name, data.custName, data.customer, data.customer_name) ?? 'Customer',
    community: text(data.community) ?? '',
    serviceType: text(data.service_type, data.serviceType) ?? '',
    flatNo: text(data.flat_no, data.flatNo) ?? '',
    priceInr: Number.isFinite(price) && price >= 0 ? price : 0,
    bookingType: text(data.offer_booking_type, data.booking_type, data.bookingType),
    scheduledDate: text(data.scheduled_date, data.scheduledDate),
    scheduledTime: text(data.scheduled_time, data.scheduledTime, data.scheduled_time_raw),
    prealertSent: String(data.prealert_sent ?? data.prealertSent ?? false).toLowerCase() === 'true',
    timeoutAt,
    source: 'fcm',
  };
}