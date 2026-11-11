import { beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = { prepare: vi.fn(), getState: vi.fn(), cancel: vi.fn(async () => undefined) };
const invoke = vi.fn();
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' }, registerPlugin: () => plugin }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock('@supabase/supabase-js', () => ({ FunctionsHttpError: class FunctionsHttpError extends Error { context: { text: () => Promise<string> }; constructor(body: string) { super('x'); this.context = { text: async () => body }; } } }));

import { FunctionsHttpError } from '@supabase/supabase-js';
import { PRACTICE_PUSH_ENABLED, practiceFailureFromServer, sendPracticePush, shouldRestorePractice } from '../practiceNotification';
import { newPractice, practiceTransition } from '../practiceBooking';

const ID = 'practice-12345678-1234-4123-8123-123456789abc';
const SHA = 'c'.repeat(64);
const input = { id: ID, expiresAt: Date.now() + 60000, userId: 'user-1', hasToken: true, tokenStatus: 'active' };
beforeEach(() => { plugin.prepare.mockReset(); plugin.cancel.mockClear(); invoke.mockReset(); });

describe('practice push client (mocked phone and server)', () => {
  it('real sending stays switched off', async () => {
    expect(PRACTICE_PUSH_ENABLED).toBe(false);
    expect(await sendPracticePush(input)).toEqual({ sent: false, reason: 'approval' });
    expect(plugin.prepare).not.toHaveBeenCalled(); expect(invoke).not.toHaveBeenCalled();
  });
  it('sends only id, expiry and this phone\'s fingerprint — no worker id or token', async () => {
    plugin.prepare.mockResolvedValue({ ready: true, tokenSha256: SHA });
    invoke.mockResolvedValue({ data: { sent: true, practice_id: ID }, error: null });
    expect(await sendPracticePush(input, true)).toEqual({ sent: true });
    expect(plugin.prepare).toHaveBeenCalledWith({ id: ID, expiresAt: input.expiresAt, userId: 'user-1' });
    expect(invoke).toHaveBeenCalledWith('send-practice-notification', { body: { practice_id: ID, expires_at: input.expiresAt, device_token_sha256: SHA } });
  });
  it('requires a login and a phone-bound session', async () => {
    expect(await sendPracticePush({ ...input, userId: null }, true)).toEqual({ sent: false, reason: 'login_required' });
    plugin.prepare.mockResolvedValue({ ready: false, reason: 'account_mismatch' });
    expect(await sendPracticePush(input, true)).toEqual({ sent: false, reason: 'account_mismatch' });
    plugin.prepare.mockResolvedValue({ ready: false, reason: 'busy' });
    expect(await sendPracticePush(input, true)).toEqual({ sent: false, reason: 'busy' });
    plugin.prepare.mockResolvedValue({ ready: true, tokenSha256: 'not-a-hash' });
    expect(await sendPracticePush(input, true)).toEqual({ sent: false, reason: 'native_missing' });
    expect(invoke).not.toHaveBeenCalled();
  });
  it('shows the server reason; an uncertain send keeps the phone ready to match receipt', async () => {
    plugin.prepare.mockResolvedValue({ ready: true, tokenSha256: SHA });
    invoke.mockResolvedValue({ data: null, error: new (FunctionsHttpError as unknown as new (b: string) => Error)(JSON.stringify({ sent: false, reason: 'device_mismatch' })) });
    expect(await sendPracticePush(input, true)).toEqual({ sent: false, reason: 'device_mismatch' });
    expect(plugin.cancel).toHaveBeenCalledTimes(1);
    plugin.cancel.mockClear();
    invoke.mockResolvedValue({ data: null, error: new (FunctionsHttpError as unknown as new (b: string) => Error)(JSON.stringify({ sent: false, reason: 'delivery_unknown' })) });
    expect(await sendPracticePush(input, true)).toEqual({ sent: false, reason: 'delivery_unknown' });
    expect(plugin.cancel).not.toHaveBeenCalled();
  });
  it('a reply for a different practice id is not success', async () => {
    plugin.prepare.mockResolvedValue({ ready: true, tokenSha256: SHA });
    invoke.mockResolvedValue({ data: { sent: true, practice_id: 'practice-other' }, error: null });
    expect(await sendPracticePush(input, true)).toEqual({ sent: false, reason: 'sendError' });
  });
  it('maps every server refusal to a worker message', () => {
    expect(practiceFailureFromServer('real_work_active')).toBe('busy');
    expect(practiceFailureFromServer('already_attempted')).toBe('attempt_in_progress');
    expect(practiceFailureFromServer('device_changed')).toBe('device_mismatch');
    expect(practiceFailureFromServer('approval_required')).toBe('approval');
    expect(practiceFailureFromServer('something new')).toBe('sendError');
  });
});

describe('restoring a practice accepted on the phone alert', () => {
  const now = 1794391800000;
  it('only for the same login, an accepted practice, within 10 minutes', () => {
    const st = { id: ID, received: true, overlay: true, outcome: 'accepted', userId: 'user-1', acceptedAt: now - 1000 };
    expect(shouldRestorePractice(st, 'user-1', now)).toBe(true);
    expect(shouldRestorePractice(st, 'user-2', now)).toBe(false);
    expect(shouldRestorePractice({ ...st, outcome: 'rejected' }, 'user-1', now)).toBe(false);
    expect(shouldRestorePractice({ ...st, acceptedAt: now - 11 * 60000 }, 'user-1', now)).toBe(false);
    expect(shouldRestorePractice({ ...st, id: 'booking-123' }, 'user-1', now)).toBe(false);
    expect(shouldRestorePractice(st, null, now)).toBe(false);
  });
  it('continues at Accepted with device evidence; never from a running practice', () => {
    const s = practiceTransition(newPractice('practice-new', now), { type: 'restore', id: ID, received: true, overlay: false });
    expect(s.id).toBe(ID); expect(s.step).toBe('accepted');
    expect(s.checks).toMatchObject({ sent: 'passed', received: 'passed', overlay: 'not_verified', accepted: 'passed', startOtp: 'not_verified' });
    const running = { ...newPractice('practice-x', now), step: 'in_progress' as const };
    expect(practiceTransition(running, { type: 'restore', id: ID, received: true, overlay: true })).toBe(running);
    const blocked = { ...newPractice('practice-x', now), step: 'blocked' as const };
    expect(practiceTransition(blocked, { type: 'restore', id: ID, received: true, overlay: true })).toBe(blocked);
  });
});
