import { expect, it } from 'vitest';
import { FAVORITE_V1_STATUS_ENABLED, OFFER_ACCEPTANCE_RPC, offerAcceptanceRpc } from '../offerAcceptanceContract';
it('the single canonical acceptance endpoint is the existing try_accept_booking', () => {
  expect(OFFER_ACCEPTANCE_RPC).toBe('try_accept_booking');
  expect(offerAcceptanceRpc()).toBe('try_accept_booking');
});
it('favorite-v1 status read stays off until Admin confirms the contract', () => {
  expect(FAVORITE_V1_STATUS_ENABLED).toBe(false);
});
