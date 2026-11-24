import { describe, expect, it } from 'vitest';
import { favoriteLocalDeadline, parseFavoriteOfferStatus } from '../favoriteOfferStatus';

const base = () => ({ contract_version: 'favorite-v1', booking_id: 'b1', request_id: 'r1', offer_generation: 2, status: 'sent',
  actionable: true, expires_at: '2026-11-24T10:01:00Z', server_time: '2026-11-24T10:00:30Z' });
const exp = { bookingId: 'b1', requestId: 'r1' };

describe('favorite-v1 offer status', () => {
  it('accepts a valid open offer with original expiry and server time', () => {
    const s = parseFavoriteOfferStatus(base(), exp)!;
    expect(s.actionable).toBe(true);
    expect(s.expiresAt - s.serverTime).toBe(30_000);
    expect(s.generation).toBe(2);
  });
  it('rejects wrong version, booking, request, generation, status or dates', () => {
    for (const bad of [{ contract_version: 'favorite-v2' }, { contract_version: 1 }, { booking_id: 'b2' }, { request_id: 'r2' },
      { request_id: '' }, { offer_generation: 0 }, { offer_generation: 1.5 }, { status: 'open' }, { actionable: 'yes' },
      { expires_at: 'soon' }, { server_time: null }, { expires_at: '2026-11-24' }]) {
      expect(parseFavoriteOfferStatus({ ...base(), ...bad }, exp)).toBeNull();
    }
    expect(parseFavoriteOfferStatus(null, exp)).toBeNull();
    expect(parseFavoriteOfferStatus([base()], exp)).toBeNull();
  });
  it('refuses a server claim that a closed or expired offer is actionable', () => {
    expect(parseFavoriteOfferStatus({ ...base(), status: 'accepted' }, exp)).toBeNull();
    expect(parseFavoriteOfferStatus({ ...base(), server_time: '2026-11-24T10:01:00Z' }, exp)).toBeNull();
  });
  it('non-actionable closed offer parses but has no deadline', () => {
    const s = parseFavoriteOfferStatus({ ...base(), status: 'expired', actionable: false }, exp)!;
    expect(favoriteLocalDeadline(s, 1_000_000)).toBeNull();
  });
  it('corrects phone clock skew using remaining server time', () => {
    const s = parseFavoriteOfferStatus(base(), exp)!;
    expect(favoriteLocalDeadline(s, 5_000_000)).toBe(5_030_000);
  });
  it('never extends an original deadline the phone already holds', () => {
    const s = parseFavoriteOfferStatus(base(), exp)!;
    expect(favoriteLocalDeadline(s, 5_000_000, 5_010_000)).toBe(5_010_000);
    expect(favoriteLocalDeadline(s, 5_000_000, 4_999_000)).toBeNull();
  });
});
