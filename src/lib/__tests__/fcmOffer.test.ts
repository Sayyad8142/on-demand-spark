import { describe, expect, it } from 'vitest';
import { fcmOfferDeadline, parseFcmOffer } from '../fcmOffer';
import { buildNativeOverlayPayload } from '../nativeOverlayPayload';

const now = 1_794_470_400_000;
const payload = { type: 'BOOKING_ALERT', booking_id: 'booking', booking_request_id: 'request', expires_at: String(now / 1000 + 60) };

describe('FCM offer wire contract', () => {
  it('preserves epoch-second expiry through native transport', () => {
    const offer = parseFcmOffer(payload, now);
    expect(offer?.timeoutAt).toBe(new Date(now + 60_000).toISOString());
    expect(offer && JSON.parse(buildNativeOverlayPayload(offer, now) ?? '{}').expires_at).toBe(now / 1000 + 60);
  });
  it('preserves millisecond expiry', () => {
    expect(fcmOfferDeadline({ expires_at: now + 60_000 })).toBe(new Date(now + 60_000).toISOString());
  });
  it('preserves ISO expiry aliases', () => {
    expect(fcmOfferDeadline({ timeout_at: new Date(now + 60_000).toISOString() })).toBe(new Date(now + 60_000).toISOString());
  });
  it('uses original sent time plus TTL, not receipt time', () => {
    expect(fcmOfferDeadline({ sent_at: now / 1000, ttl_seconds: '60' })).toBe(new Date(now + 60_000).toISOString());
  });
  it('never restarts the window on a later tap', () => {
    expect(parseFcmOffer(payload, now + 60_000)).toBeNull();
    expect(parseFcmOffer(payload, now + 59_000)?.timeoutAt).toBe(new Date(now + 60_000).toISOString());
  });
  it('refuses missing or invalid deadlines instead of a fresh 60 seconds', () => {
    expect(parseFcmOffer({ ...payload, expires_at: undefined }, now)).toBeNull();
    expect(parseFcmOffer({ ...payload, expires_at: 'bad', sent_at: now / 1000 }, now)).toBeNull();
  });
  it.each(['BOOKING_CANCELLED', 'BOOKING_REASSIGNED', 'PING', 'INFO', undefined])('never opens %s as an offer', type => {
    expect(parseFcmOffer({ ...payload, type }, now)).toBeNull();
  });
  it('refuses informational BOOKING_ALERTs', () => {
    expect(parseFcmOffer({ ...payload, actionable: 'FALSE' }, now)).toBeNull();
    expect(parseFcmOffer({ ...payload, actionable: false }, now)).toBeNull();
  });
  it('keeps IDs, customer, decimal price and actual scheduled kind', () => {
    expect(parseFcmOffer({ ...payload, customer: 'Alice', price: '₹249.50', booking_type: 'instant', offer_booking_type: 'scheduled', scheduled_date: '2026-11-12', scheduled_time: '12:30', prealert_sent: 'true' }, now)).toMatchObject({
      bookingId: 'booking', bookingRequestId: 'request', custName: 'Alice', priceInr: 249.5,
      bookingType: 'scheduled', scheduledDate: '2026-11-12', scheduledTime: '12:30', prealertSent: true,
    });
  });
  it('keeps legacy display and ID aliases', () => {
    expect(parseFcmOffer({ ...payload, booking_id: undefined, booking_request_id: undefined, bookingId: 'legacy', bookingRequestId: 'legacy-request', custName: 'Bob', priceInr: 200 }, now)).toMatchObject({ bookingId: 'legacy', bookingRequestId: 'legacy-request', custName: 'Bob', priceInr: 200 });
  });
});