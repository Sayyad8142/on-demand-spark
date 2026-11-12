import { describe, expect, it, vi } from 'vitest';
import { parsePracticeRequest, preparePracticeSend, type PracticeSenderAdapters } from '../../../docs/test-booking-training-2026-11-11/sender/staged/send-practice-notification/senderCore';
import { sendPracticePush } from '../practiceNotification';

const now = 1794391800000;
const id = 'practice-12345678-1234-4123-8123-123456789abc';
const fingerprint = 'a'.repeat(64);
const request = { practice_id: id, expires_at: now + 60000, device_token_sha256: fingerprint };
function adapters(): PracticeSenderAdapters {
  return {
    enabled: true, now: () => now,
    authenticate: vi.fn(async () => ({ userId: 'own-user' })),
    ownDevice: vi.fn(async () => ({ token: 'fake-device-token', tokenSha256: fingerprint, status: 'active', platform: 'android' })),
    idle: vi.fn(async () => true), claim: vi.fn(async () => 'new' as const),
    record: vi.fn(async () => undefined),
    send: vi.fn(async () => ({ ok: true, status: 200, body: '{}', messageId: 'mock-message' })),
  };
}
describe('practice sender preparation (mocked; no live delivery)', () => {
  it('keeps the existing app sending switch off', async () => {
    expect(await sendPracticePush({ userId: 'own-user', id, expiresAt: now + 60000, hasToken: true, tokenStatus: 'active' })).toEqual({ sent: false, reason: 'approval' });
  });
  it('disabled server plan performs no authentication or send', async () => {
    const a = adapters(); a.enabled = false;
    expect((await preparePracticeSend(request, a)).status).toBe(503);
    expect(a.authenticate).not.toHaveBeenCalled(); expect(a.send).not.toHaveBeenCalled();
  });
  it('requires a verified login', async () => {
    const a = adapters(); a.authenticate = vi.fn(async () => null);
    expect((await preparePracticeSend(request, a)).status).toBe(401); expect(a.send).not.toHaveBeenCalled();
  });
  it.each(['worker_id', 'token', 'booking_id', 'otp', 'price'])('refuses client-supplied %s', key => {
    expect(parsePracticeRequest({ ...request, [key]: 'forbidden' }, now)).toBeNull();
  });
  it('accepts only practice UUIDs and at most 60 seconds', () => {
    expect(parsePracticeRequest(request, now)).toEqual(request);
    expect(parsePracticeRequest({ ...request, practice_id: 'real-booking' }, now)).toBeNull();
    expect(parsePracticeRequest({ ...request, expires_at: now + 60001 }, now)).toBeNull();
    expect(parsePracticeRequest({ ...request, expires_at: now }, now)).toBeNull();
  });
  it.each([
    [null, 'token_missing'],
    [{ token: '', tokenSha256: fingerprint, status: 'active', platform: 'android' }, 'token_missing'],
    [{ token: 'fake', tokenSha256: fingerprint, status: 'invalid', platform: 'android' }, 'token_invalid'],
    [{ token: 'fake', tokenSha256: fingerprint, status: 'active', platform: 'web' }, 'android_required'],
    [{ token: 'fake', tokenSha256: 'b'.repeat(64), status: 'active', platform: 'android' }, 'device_mismatch'],
  ] as const)('refuses an unsuitable registered device %#', async (device, reason) => {
    const a = adapters(); a.ownDevice = vi.fn(async () => device);
    expect((await preparePracticeSend(request, a)).body.reason).toBe(reason); expect(a.send).not.toHaveBeenCalled();
  });
  it('active real work blocks sending before claiming', async () => {
    const a = adapters(); a.idle = vi.fn(async () => false);
    expect((await preparePracticeSend(request, a)).body.reason).toBe('real_work_active'); expect(a.claim).not.toHaveBeenCalled();
  });
  it('unknown safety blocks sending', async () => {
    const a = adapters(); a.idle = vi.fn(async () => { throw new Error('offline'); });
    expect((await preparePracticeSend(request, a)).body.reason).toBe('safety_check_unavailable'); expect(a.send).not.toHaveBeenCalled();
  });
  it('rechecks real work after claiming', async () => {
    const a = adapters(); a.idle = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await preparePracticeSend(request, a)).body.reason).toBe('real_work_active'); expect(a.send).not.toHaveBeenCalled();
  });
  it('refuses token rotation between safety check and submission', async () => {
    const a = adapters(); a.ownDevice = vi.fn().mockResolvedValueOnce({ token: 'old', tokenSha256: fingerprint, status: 'active', platform: 'android' }).mockResolvedValueOnce({ token: 'new', tokenSha256: fingerprint, status: 'active', platform: 'android' });
    expect((await preparePracticeSend(request, a)).body.reason).toBe('device_changed'); expect(a.send).not.toHaveBeenCalled();
  });
  it.each(['duplicate', 'busy'] as const)('does not resend a %s claim', async claim => {
    const a = adapters(); a.claim = vi.fn(async () => claim);
    expect((await preparePracticeSend(request, a)).body.sent).toBe(false); expect(a.send).not.toHaveBeenCalled();
  });
  it('expired after checking never reaches FCM', async () => {
    const a = adapters(); a.now = vi.fn().mockReturnValueOnce(now).mockReturnValueOnce(now + 60000);
    expect((await preparePracticeSend(request, a)).status).toBe(410); expect(a.send).not.toHaveBeenCalled();
  });
  it('sends exactly one data-only message to the authenticated registered device', async () => {
    const a = adapters();
    expect(await preparePracticeSend(request, a)).toEqual({ status: 200, body: { sent: true, practice_id: id } });
    expect(a.ownDevice).toHaveBeenCalledWith('own-user');
    expect(a.send).toHaveBeenCalledExactlyOnceWith({ message: { token: 'fake-device-token', android: { priority: 'HIGH', ttl: '60s' }, data: { type: 'PRACTICE_BOOKING', practice_id: id, expires_at: String(now + 60000) } } });
    expect(a.record).toHaveBeenCalledWith('own-user', id, 'provider_accepted');
  });
  it('preserves provider failure status without claiming delivery', async () => {
    const a = adapters(); a.send = vi.fn(async () => ({ ok: false, status: 404, body: 'UNREGISTERED' }));
    expect(await preparePracticeSend(request, a)).toEqual({ status: 404, body: { sent: false, reason: 'provider_failed', provider_status: 404, details: 'UNREGISTERED' } });
    expect(a.record).toHaveBeenCalledWith('own-user', id, 'failed');
  });
  it('timeout remains unknown and is not retried', async () => {
    const a = adapters(); a.send = vi.fn(async () => { throw new Error('timeout'); });
    expect((await preparePracticeSend(request, a)).body.reason).toBe('delivery_unknown');
    expect(a.send).toHaveBeenCalledTimes(1); expect(a.record).toHaveBeenCalledWith('own-user', id, 'unknown');
  });
  it('a 2xx without provider message ID is not verified sending', async () => {
    const a = adapters(); a.send = vi.fn(async () => ({ ok: true, status: 200, body: '{}' }));
    expect((await preparePracticeSend(request, a)).body.reason).toBe('provider_unconfirmed');
  });
});