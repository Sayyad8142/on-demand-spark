import { expect, it } from 'vitest';
import { offerAcceptanceRpc, SECURE_OFFER_ACCEPTANCE_ENABLED } from '../offerAcceptanceContract';
it('keeps unavailable strict endpoint staged until Admin approval and grant', () => {
  expect(SECURE_OFFER_ACCEPTANCE_ENABLED).toBe(false);
  expect(offerAcceptanceRpc()).toBe('try_accept_booking');
});
it('approved mode selects only the secure endpoint without worker identity', () => {
  expect(offerAcceptanceRpc(true)).toBe('accept_booking');
});