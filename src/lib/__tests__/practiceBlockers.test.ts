import { readFileSync, readdirSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { plugin, invoke } = vi.hoisted(() => ({ plugin: { prepare: vi.fn(), getState: vi.fn(), cancel: vi.fn(async () => undefined) }, invoke: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' }, registerPlugin: () => plugin }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { preparePracticeSend, type PracticeSenderAdapters } from '../../../docs/test-booking-training-2026-11-11/sender/staged/send-practice-notification/senderCore';
import { corsHeaders, handlePracticeRequest } from '../../../docs/test-booking-training-2026-11-11/sender/staged/send-practice-notification/handler';
import { PRACTICE_PUSH_ENABLED, sendPracticePush, shouldClearRestoredSession } from '../practiceNotification';
import { newPractice, practiceTransition } from '../practiceBooking';

const DIR = 'docs/test-booking-training-2026-11-11/sender/staged';
const FN = `${DIR}/send-practice-notification`;
const ID = 'practice-12345678-1234-4123-8123-123456789abc';
const SHA = 'a'.repeat(64);
const NOW = 1794458160000;
const read = (p: string) => readFileSync(p, 'utf8');

function adapters(over: Partial<PracticeSenderAdapters> = {}): PracticeSenderAdapters {
  return {
    enabled: true, now: () => NOW,
    authenticate: vi.fn(async () => ({ userId: 'own-user' })),
    ownDevice: vi.fn(async () => ({ token: 'fake-device-token', tokenSha256: SHA, status: 'active', platform: 'android' })),
    idle: vi.fn(async () => true), claim: vi.fn(async () => 'new' as const), record: vi.fn(async () => undefined),
    send: vi.fn(async () => ({ ok: true, status: 200, body: '', messageId: 'projects/x/messages/1' })), ...over,
  };
}
const request = { practice_id: ID, expires_at: NOW + 60000, device_token_sha256: SHA };
beforeEach(() => { plugin.prepare.mockReset(); plugin.cancel.mockClear(); invoke.mockReset(); });

describe('sender packaging and switches', () => {
  it('the function folder is self-contained (no imports outside it)', () => {
    for (const f of readdirSync(FN)) {
      const imports = [...read(`${FN}/${f}`).matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);
      expect(imports.every(i => i.startsWith('./')), f).toBe(true);
    }
  });
  it('both sending switches stay OFF; the server accepts only the exact words "on" or "validate"', () => {
    expect(PRACTICE_PUSH_ENABLED).toBe(false);
    const index = read(`${FN}/index.ts`);
    expect(index).toContain("enabled: ['on', 'validate'].includes(Deno.env.get('PRACTICE_PUSH_SENDER') ?? '')");
    expect(index).toContain("validateOnly: Deno.env.get('PRACTICE_PUSH_SENDER') === 'validate'");
  });
  it('switched off refuses before reading the login', async () => {
    const a = adapters({ enabled: false });
    const res = await handlePracticeRequest(new Request('https://x.invalid', { method: 'POST', body: JSON.stringify(request) }), () => a);
    expect(res.status).toBe(503);
    expect(a.authenticate).not.toHaveBeenCalled();
  });
  it('browser preflight allows the headers the app client sends', () => {
    for (const h of ['authorization', 'apikey', 'content-type', 'x-client-info', 'x-supabase-client-platform']) expect(corsHeaders['Access-Control-Allow-Headers']).toContain(h);
  });
  it('identity is verified in code on every request (gateway check not relied on)', () => {
    expect(read(`${DIR}/config.toml.snippet`)).toMatch(/\[functions\.send-practice-notification\]\s*\nverify_jwt = false/);
    expect(read(`${FN}/adapters.ts`)).toContain('/auth/v1/user');
  });
});

describe('transport check mode delivers nothing', () => {
  it('validate mode asks FCM to validate only and records "validated", never "provider_accepted"', async () => {
    const a = adapters({ validateOnly: true });
    expect(await preparePracticeSend(request, a)).toEqual({ status: 200, body: { sent: false, practice_id: ID, reason: 'validated_only' } });
    expect(a.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ validate_only: true }));
    expect(a.record).toHaveBeenCalledWith('own-user', ID, 'validated');
    expect(a.record).not.toHaveBeenCalledWith('own-user', ID, 'provider_accepted');
  });
  it('the push carries this phone\'s fingerprint so the phone can refuse pushes meant for another device', async () => {
    const a = adapters();
    await preparePracticeSend(request, a);
    const msg = (a.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(msg.message.data.token_sha256).toBe(SHA);
    expect(msg.validate_only).toBeUndefined();
  });
  it('the app treats a validate-only reply as "not available" and clears the phone session', async () => {
    plugin.prepare.mockResolvedValue({ ready: true, tokenSha256: SHA });
    invoke.mockResolvedValue({ data: { sent: false, reason: 'validated_only', practice_id: ID }, error: null });
    expect(await sendPracticePush({ id: ID, expiresAt: Date.now() + 60000, userId: 'u', hasToken: true, tokenStatus: 'active' }, true)).toEqual({ sent: false, reason: 'approval' });
    expect(plugin.cancel).toHaveBeenCalled();
  });
});

describe('session races in the app', () => {
  it('a late reply for an earlier practice never changes the current one', () => {
    let s = practiceTransition(newPractice('practice-new', NOW), { type: 'sending', now: NOW });
    expect(practiceTransition(s, { type: 'sent', id: 'practice-old' })).toBe(s);
    expect(practiceTransition(s, { type: 'failed_send', id: 'practice-old' })).toBe(s);
    s = practiceTransition(s, { type: 'sent', id: 'practice-new' });
    expect(s.step).toBe('waiting');
  });
  it('opening the page never clears a session that is still waiting for its push', () => {
    expect(shouldClearRestoredSession({ id: ID, received: false, overlay: false, outcome: '' })).toBe(false);
    expect(shouldClearRestoredSession({ id: ID, received: true, overlay: false })).toBe(false);
    expect(shouldClearRestoredSession({ id: '', received: false, overlay: false, outcome: 'cancelled' })).toBe(false);
    expect(shouldClearRestoredSession({ id: ID, received: true, overlay: false, outcome: 'accepted' })).toBe(true);
  });
});

describe('practice can never reach production booking services', () => {
  const native = ['PracticePushReceiver.kt', 'PracticeNotificationsPlugin.kt', 'PracticeAlertActivity.kt'].map(f => read(`android/app/src/main/java/app/didisnow/worker/${f}`)).join('\n');
  const app = [read('src/lib/practiceBooking.ts'), read('src/pages/TestBooking.tsx')].join('\n');
  it('native practice code has no network, booking sync, offer claims or delivery confirmations', () => {
    for (const banned of ['BackendSync', 'claimAcceptance', 'markLocallyBusy', 'HttpURLConnection', 'OkHttp', 'supabase', 'accept_booking', 'reject_booking', 'ack-booking-delivery', 'booking_requests', 'verify_start_otp']) expect(native, banned).not.toContain(banned);
  });
  it('practice screens never call the backend or real booking actions', () => {
    for (const banned of ['supabase.rpc', 'supabase.from', 'accept_booking', 'reject_booking', 'verify_start_otp', 'complete_booking', 'ack-booking-delivery']) expect(app, banned).not.toContain(banned);
  });
  it('practice messages leave the real booking path before anything else runs', () => {
    const fcm = read('android/app/src/main/java/app/didisnow/worker/MyFirebaseService.java');
    const practice = fcm.indexOf('"PRACTICE_BOOKING".equals');
    expect(practice).toBeGreaterThan(0);
    expect(practice).toBeLessThan(fcm.indexOf('PracticeSession.preempt'));
    expect(practice).toBeLessThan(fcm.indexOf('FCM MESSAGE RECEIVED'));
  });
});

describe('practice log access and retention (SQL)', () => {
  const sql = read(`${DIR}/sql/001_practice_push_attempts.sql`);
  it('only admins read the log, through a role check, with a shortened fingerprint', () => {
    expect(sql).toContain("public.has_role(auth.uid(), 'admin'::public.app_role)");
    expect(sql).toContain('left(a.token_sha256, 8)');
    expect(sql).toMatch(/REVOKE ALL ON public\.practice_push_attempts FROM PUBLIC, anon, authenticated/);
  });
  it('keeps evidence 30 days and allows the no-delivery "validated" outcome', () => {
    expect(sql).toContain("created_at < now() - interval '30 days'");
    expect(sql).toContain("'validated'");
  });
});
