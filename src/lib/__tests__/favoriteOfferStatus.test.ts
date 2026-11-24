import { describe, expect, it } from 'vitest';
import { favoriteLocalDeadline, parseFavoriteOfferStatus } from '../favoriteOfferStatus';
const id = '11111111-1111-4111-8111-111111111111';
const base = () => ({ contract_version: 'favorite-v1', booking_id: 'b1', request_id: id, offer_generation: id, status: 'pending',
  favorite_state: 'holding', offer_state: 'holding', actionable: true, expires_at: '2026-11-24T10:01:00Z', server_time: '2026-11-24T10:00:30Z' });
const exp = { bookingId: 'b1', requestId: id };
describe('final favorite-v1 offer status', () => {
  it('copies opaque UUID generation exactly', () => { expect(parseFavoriteOfferStatus(base(), exp)?.generation).toBe(id); });
  it.each([0, 1, 1.5, '1', undefined, 'bad', '22222222-2222-4222-8222-222222222222'])('rejects invalid or mismatched generation %s', offer_generation => {
    expect(parseFavoriteOfferStatus({ ...base(), offer_generation }, exp)).toBeNull();
  });
  it('accepts null generation only for a non-actionable answer', () => {
    const s = parseFavoriteOfferStatus({ ...base(), offer_generation: null, actionable: false }, exp);
    expect(s?.generation).toBeNull(); expect(s?.actionable).toBe(false);
    expect(parseFavoriteOfferStatus({ ...base(), offer_generation: null }, exp)).toBeNull();
  });
  it.each(['sent', 'queued', 'accepted', 'rejected', 'expired', 'lost', 'cancelled', 'unknown'])('never authorizes status %s', status => {
    expect(parseFavoriteOfferStatus({ ...base(), status }, exp)).toBeNull();
  });
  it.each(['preparing', 'holding', 'fallback_pending', 'fallback', 'accepted', 'cancelled'])('recognizes favorite state %s without inventing actionability', favorite_state => {
    expect(parseFavoriteOfferStatus({ ...base(), favorite_state, actionable: false }, exp)?.favoriteState).toBe(favorite_state);
  });
  it.each(['holding', 'accepted', 'closed'])('recognizes normal state %s', offer_state => {
    expect(parseFavoriteOfferStatus({ ...base(), favorite_state: null, offer_state, actionable: false }, exp)?.offerState).toBe(offer_state);
  });
  it('unknown/malformed state fields never authorize', () => {
    for (const bad of [{ favorite_state: 'ready' }, { favorite_state: undefined }, { offer_state: 'open' }, { offer_state: null }]) {
      expect(parseFavoriteOfferStatus({ ...base(), ...bad }, exp)).toBeNull();
    }
  });
  it.each(['preparing', 'fallback_pending', 'accepted', 'cancelled'])('refuses actionable favorite state %s', favorite_state => {
    expect(parseFavoriteOfferStatus({ ...base(), favorite_state }, exp)).toBeNull();
  });
  it('requires future original server expiry for pending offers', () => {
    expect(parseFavoriteOfferStatus({ ...base(), expires_at: null }, exp)).toBeNull();
    expect(parseFavoriteOfferStatus({ ...base(), server_time: base().expires_at }, exp)).toBeNull();
  });
  it('corrects phone clock without extending original deadline', () => {
    const s = parseFavoriteOfferStatus(base(), exp); expect(s).not.toBeNull(); if (!s) return;
    expect(favoriteLocalDeadline(s, 5000000)).toBe(5030000);
    expect(favoriteLocalDeadline(s, 5000000, 5010000)).toBe(5010000);
    expect(favoriteLocalDeadline(s, 5000000, 4999000)).toBeNull();
  });
  it('rejects wrong booking, identity, version and invalid dates', () => {
    for (const bad of [{ booking_id: 'b2' }, { request_id: '' }, { contract_version: 'other' }, { expires_at: 'soon' }, { server_time: null }, { actionable: 'true' }]) {
      expect(parseFavoriteOfferStatus({ ...base(), ...bad }, exp)).toBeNull();
    }
  });
});
