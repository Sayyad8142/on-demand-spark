import { beforeEach, expect, it, vi } from 'vitest';
import { rememberOfferPresentation, wasOfferPresented } from '../offerReplay';
beforeEach(() => localStorage.clear());
it('reopening preserves durable dedupe of the same request/deadline', async () => {
  rememberOfferPresentation('b:r:1000', 1000);
  vi.resetModules();
  const reopened = await import('../offerReplay');
  expect(reopened.wasOfferPresented('b:r:1000', 2000)).toBe(true);
  expect(reopened.wasOfferPresented('b:r:2000', 2000)).toBe(false);
});
it('corrupt storage cannot authorize or suppress an offer', () => {
  localStorage.setItem('didi:shown-offer-generations:v1', 'invalid');
  expect(wasOfferPresented('b:r:1000', 1000)).toBe(false);
});