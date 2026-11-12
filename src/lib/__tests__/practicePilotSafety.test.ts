import { describe, expect, it, vi } from 'vitest';
import { createLiveAdapters, sha256Hex } from '../../../docs/test-booking-training-2026-11-11/sender/staged/adapters';
import { preparePracticeSend } from '../../../docs/test-booking-training-2026-11-11/sender/staged/senderCore';
import { newPractice, practiceTransition } from '../practiceBooking';

const userId = '11111111-2222-4333-8444-555555555555';
const token = 'fake-own-device';
const now = 1794458160000;
const id = 'practice-12345678-1234-4123-8123-123456789abc';
async function setup(pilotUserId?: string, pilotTokenSha256?: string, claim = 'new') {
  const fetcher = vi.fn(async (url: RequestInfo | URL) => {
    const path = String(url);
    if (path.endsWith('/auth/v1/user')) return Response.json({ id: userId });
    if (path.includes('workers?')) return Response.json([{ id: 'worker-own', fcm_token: token, fcm_token_status: 'active', fcm_token_platform: 'android' }]);
    if (path.includes('/rpc/claim_')) return Response.json(claim);
    if (path.includes('/rpc/record_')) return Response.json(null);
    return Response.json([]);
  });
  const adapters = createLiveAdapters({ enabled: true, supabaseUrl: 'https://test.invalid', anonKey: 'anon', serviceRoleKey: 'service', jwt: 'login', serviceAccount: null, pilotUserId, pilotTokenSha256, fetch: fetcher as typeof fetch, now: () => now });
  return { adapters, fetcher };
}
describe('controlled practice pilot protections', () => {
  it('empty pilot configuration refuses every authenticated worker', async () => {
    const { adapters, fetcher } = await setup();
    expect(await adapters.authenticate()).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('a different authenticated account cannot send to the pilot device', async () => {
    const { adapters } = await setup('another-account', await sha256Hex(token));
    expect(await adapters.authenticate()).toBeNull();
  });
  it('the approved account still cannot target an unapproved device', async () => {
    const { adapters } = await setup(userId, 'b'.repeat(64));
    expect(await adapters.authenticate()).toEqual({ userId });
    expect(await adapters.ownDevice(userId)).toBeNull();
  });
  it('only the approved account and fingerprint resolve the own device', async () => {
    const hash = await sha256Hex(token);
    const { adapters } = await setup(userId, hash);
    await adapters.authenticate();
    expect(await adapters.ownDevice(userId)).toMatchObject({ tokenSha256: hash, platform: 'android' });
    expect(await adapters.ownDevice('other')).toBeNull();
  });
  it('a durable quota refusal never reaches FCM', async () => {
    const hash = await sha256Hex(token);
    const { adapters } = await setup(userId, hash, 'rate_limited');
    const send = vi.spyOn(adapters, 'send');
    expect(await preparePracticeSend({ practice_id: id, expires_at: now + 60000, device_token_sha256: hash }, adapters)).toEqual({ status: 409, body: { sent: false, reason: 'rate_limited' } });
    expect(send).not.toHaveBeenCalled();
  });
  it('an uncertain submission waits for receipt with sent Not Verified', () => {
    const sending = practiceTransition(newPractice(id, now), { type: 'sending', now });
    const uncertain = practiceTransition(sending, { type: 'unknown_send' });
    expect(uncertain.step).toBe('waiting');
    expect(uncertain.checks).toMatchObject({ sent: 'not_verified', received: 'not_verified', overlay: 'not_verified' });
    const receipt = practiceTransition(uncertain, { type: 'device', id, received: true, overlay: false, now: now + 1000 });
    expect(receipt.checks.received).toBe('passed');
    expect(receipt.checks.overlay).toBe('not_verified');
  });
});