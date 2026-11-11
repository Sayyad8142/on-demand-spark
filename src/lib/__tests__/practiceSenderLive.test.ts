// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createLiveAdapters, googleAccessToken, PRACTICE_ACTIVE_WORK_STATUSES, redact, sha256Hex, type AdapterConfig } from '../../../docs/test-booking-training-2026-11-11/sender/staged/adapters';
import { handlePracticeRequest } from '../../../docs/test-booking-training-2026-11-11/sender/staged/send-practice-notification/handler';
import { preparePracticeSend } from '../../../docs/test-booking-training-2026-11-11/sender/staged/senderCore';
import { ACTIVE_WORK_STATUSES } from '../workSafety';

const NOW = 1794391800000;
const ID = 'practice-12345678-1234-4123-8123-123456789abc';
const USER = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'dKx1fakeFcmTokenPrefixAAAAAAA:APA91bFakeRegistrationTokenBodyThatIsLongEnoughToLookRealxxxxxxxxxxxxxxxxxxxxxxxx';
const URL0 = 'https://proj.supabase.co';

async function serviceAccount() {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----\n`;
  return { sa: { project_id: 'didi-now', client_email: 'sender@didi-now.iam.gserviceaccount.com', private_key: pem }, publicKey: pair.publicKey };
}
type Call = { url: string; method: string; body?: string; headers: Record<string, string> };
function world(opts: { workers?: unknown[]; jobs?: unknown[]; offers?: unknown[]; claim?: unknown; fcm?: (call: Call) => Response | Promise<Response>; userStatus?: number } = {}) {
  const calls: Call[] = [];
  const f = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input); const method = init.method ?? 'GET';
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
    const body = typeof init.body === 'string' ? init.body : init.body ? String(init.body) : undefined;
    const call = { url, method, body, headers }; calls.push(call);
    const ok = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
    if (url.endsWith('/auth/v1/user')) return opts.userStatus && opts.userStatus !== 200 ? new Response('{}', { status: opts.userStatus }) : ok({ id: USER });
    if (url.includes('/rest/v1/workers?')) return ok(opts.workers ?? [{ id: 'w1', fcm_token: TOKEN, fcm_token_status: 'active', fcm_token_platform: 'android' }]);
    if (url.includes('/rest/v1/bookings?')) return ok(opts.jobs ?? []);
    if (url.includes('/rest/v1/booking_requests?')) return ok(opts.offers ?? []);
    if (url.endsWith('/rpc/claim_practice_push_attempt')) return ok(opts.claim ?? 'new');
    if (url.endsWith('/rpc/record_practice_push_outcome')) return ok(null);
    if (url === 'https://oauth2.googleapis.com/token') return ok({ access_token: 'ya29.fake-google-access' });
    if (url.startsWith('https://fcm.googleapis.com/')) return opts.fcm ? opts.fcm(call) : ok({ name: 'projects/didi-now/messages/1' });
    return new Response('unexpected', { status: 599 });
  });
  return { calls, fetch: f as unknown as typeof fetch };
}
async function config(w: ReturnType<typeof world>, over: Partial<AdapterConfig> = {}): Promise<AdapterConfig> {
  return { enabled: true, supabaseUrl: URL0, anonKey: 'anon-key', serviceRoleKey: 'service-key', jwt: 'user-jwt', serviceAccount: (await serviceAccount()).sa, fetch: w.fetch, now: () => NOW, ...over };
}
const body = async () => ({ practice_id: ID, expires_at: NOW + 60000, device_token_sha256: await sha256Hex(TOKEN) });

describe('practice sender live adapters (mocked network; nothing sent)', () => {
  it('uses the same active-work statuses as the app', () => {
    expect([...PRACTICE_ACTIVE_WORK_STATUSES]).toEqual([...ACTIVE_WORK_STATUSES]);
  });
  it('end-to-end: own device only, data-only practice message, journal claimed and recorded', async () => {
    const w = world();
    const r = await preparePracticeSend(await body(), createLiveAdapters(await config(w)));
    expect(r).toEqual({ status: 200, body: { sent: true, practice_id: ID } });
    const fcm = w.calls.filter(c => c.url.startsWith('https://fcm.googleapis.com/'));
    expect(fcm).toHaveLength(1);
    expect(fcm[0].url).toBe('https://fcm.googleapis.com/v1/projects/didi-now/messages:send');
    const msg = JSON.parse(fcm[0].body!).message;
    expect(msg.token).toBe(TOKEN);
    expect(msg.notification).toBeUndefined();
    expect(Object.keys(msg.data).sort()).toEqual(['expires_at', 'practice_id', 'type']);
    expect(msg.data).toEqual({ type: 'PRACTICE_BOOKING', practice_id: ID, expires_at: String(NOW + 60000) });
    expect(msg.android).toEqual({ priority: 'HIGH', ttl: '60s' });
    // Worker lookup is by verified login only — never by id= or phone.
    const lookups = w.calls.filter(c => c.url.includes('/rest/v1/workers?'));
    expect(lookups.every(c => c.url.includes(`user_id=eq.${USER}`) && !/phone|[?&]id=eq/.test(c.url))).toBe(true);
    const rpc = w.calls.filter(c => c.url.includes('/rpc/')).map(c => [c.url.split('/rpc/')[1], JSON.parse(c.body!)]);
    expect(rpc).toEqual([
      ['claim_practice_push_attempt', { p_user_id: USER, p_practice_id: ID, p_expires_at: new Date(NOW + 60000).toISOString(), p_token_sha256: await sha256Hex(TOKEN) }],
      ['record_practice_push_outcome', { p_user_id: USER, p_practice_id: ID, p_outcome: 'provider_accepted' }],
    ]);
  });
  it('never writes to real booking, worker, availability or payout tables', async () => {
    const w = world();
    await preparePracticeSend(await body(), createLiveAdapters(await config(w)));
    const supabaseWrites = w.calls.filter(c => c.url.startsWith(URL0) && c.method !== 'GET');
    expect(supabaseWrites.map(c => c.url.replace(URL0, ''))).toEqual(['/rest/v1/rpc/claim_practice_push_attempt', '/rest/v1/rpc/record_practice_push_outcome']);
    expect(w.calls.some(c => /dispatch|availability|payout|earning|booking_offer_events|send-fcm/.test(c.url))).toBe(false);
  });
  it('refuses missing, anonymous and rejected logins before any lookup', async () => {
    for (const over of [{ jwt: null }, { jwt: 'anon-key' }]) {
      const w = world();
      expect((await preparePracticeSend(await body(), createLiveAdapters(await config(w, over)))).body.reason).toBe('login_required');
      expect(w.calls.filter(c => !c.url.endsWith('/auth/v1/user'))).toHaveLength(0);
    }
    const w = world({ userStatus: 401 });
    expect((await preparePracticeSend(await body(), createLiveAdapters(await config(w)))).body.reason).toBe('login_required');
  });
  it('device lookup refuses users that were not verified first', async () => {
    const a = createLiveAdapters(await config(world()));
    expect(await a.ownDevice(USER)).toBeNull();
  });
  it('refuses missing or ambiguous worker links', async () => {
    for (const workers of [[], [{ id: 'a', fcm_token: TOKEN, fcm_token_status: 'active', fcm_token_platform: 'android' }, { id: 'b', fcm_token: TOKEN, fcm_token_status: 'active', fcm_token_platform: 'android' }]]) {
      const w = world({ workers });
      const r = await preparePracticeSend(await body(), createLiveAdapters(await config(w)));
      expect(r.body.reason).toBe('token_missing');
      expect(w.calls.some(c => c.url.startsWith('https://fcm'))).toBe(false);
    }
  });
  it('refuses when this phone is not the registered device', async () => {
    const w = world();
    const r = await preparePracticeSend({ ...(await body()), device_token_sha256: 'b'.repeat(64) }, createLiveAdapters(await config(w)));
    expect(r.body.reason).toBe('device_mismatch');
  });
  it('refuses during a real job or a waiting offer, and fails closed on read errors', async () => {
    for (const opts of [{ jobs: [{ id: 'j' }] }, { offers: [{ id: 'o' }] }]) {
      const w = world(opts);
      expect((await preparePracticeSend(await body(), createLiveAdapters(await config(w)))).body.reason).toBe('real_work_active');
      expect(w.calls.some(c => c.url.includes('/rpc/'))).toBe(false);
    }
    const bad = world();
    const original = bad.fetch;
    const failing = (async (u: RequestInfo | URL, i?: RequestInit) => String(u).includes('/rest/v1/bookings?') ? new Response('x', { status: 500 }) : original(u, i)) as typeof fetch;
    expect((await preparePracticeSend(await body(), createLiveAdapters(await config(bad, { fetch: failing })))).body.reason).toBe('safety_check_unavailable');
  });
  it('active-job query covers every active status', async () => {
    const w = world();
    await createLiveAdapters(await config(w)).authenticate();
    await createLiveAdapters(await config(w)).idle(USER); // fresh adapter: not verified → false without reads
    const a = createLiveAdapters(await config(w)); await a.authenticate(); await a.idle(USER);
    const q = w.calls.find(c => c.url.includes('/rest/v1/bookings?'))!.url;
    expect(decodeURIComponent(q)).toContain('status=in.(assigned,accepted,on_the_way,started,in_progress)');
  });
  it('duplicate and concurrent attempts never reach FCM; unexpected claim answers count as busy', async () => {
    for (const [claim, reason] of [['duplicate', 'already_attempted'], ['busy', 'attempt_in_progress'], ['weird', 'attempt_in_progress']] as const) {
      const w = world({ claim });
      expect((await preparePracticeSend(await body(), createLiveAdapters(await config(w)))).body.reason).toBe(reason);
      expect(w.calls.some(c => c.url.startsWith('https://fcm'))).toBe(false);
    }
  });
  it('provider refusal is reported with status and a redacted body, recorded as failed', async () => {
    const w = world({ fcm: () => new Response(JSON.stringify({ error: { status: 'NOT_FOUND', message: `UNREGISTERED ${TOKEN}` } }), { status: 404 }) });
    const r = await preparePracticeSend(await body(), createLiveAdapters(await config(w)));
    expect(r.status).toBe(404);
    expect(r.body.reason).toBe('provider_failed');
    expect(r.body.details).toContain('UNREGISTERED');
    expect(r.body.details).not.toContain(TOKEN);
    expect(JSON.parse(w.calls.at(-1)!.body!).p_outcome).toBe('failed');
    // UNREGISTERED must not touch the worker's stored token.
    expect(w.calls.some(c => c.url.includes('/rest/v1/workers') && c.method !== 'GET')).toBe(false);
  });
  it('missing provider message id and timeouts are "unknown", never resent', async () => {
    const w1 = world({ fcm: () => new Response('{}', { status: 200 }) });
    expect((await preparePracticeSend(await body(), createLiveAdapters(await config(w1)))).body.reason).toBe('provider_unconfirmed');
    const w2 = world({ fcm: () => { throw new DOMException('aborted', 'AbortError'); } });
    expect((await preparePracticeSend(await body(), createLiveAdapters(await config(w2)))).body.reason).toBe('delivery_unknown');
    expect(w2.calls.filter(c => c.url.startsWith('https://fcm'))).toHaveLength(1);
    expect(JSON.parse(w2.calls.at(-1)!.body!).p_outcome).toBe('unknown');
  });
  it('without service-account credentials nothing is sent', async () => {
    const w = world();
    const r = await preparePracticeSend(await body(), createLiveAdapters(await config(w, { serviceAccount: null })));
    expect(r.body.reason).toBe('provider_failed');
    expect(w.calls.some(c => c.url.startsWith('https://fcm') || c.url.includes('oauth2'))).toBe(false);
  });
  it('signs a valid Google service-account assertion', async () => {
    const { sa, publicKey } = await serviceAccount();
    const w = world();
    expect(await googleAccessToken(sa, w.fetch, NOW)).toBe('ya29.fake-google-access');
    const assertion = new URLSearchParams(String(w.calls[0].body)).get('assertion')!;
    const [h, c, s] = assertion.split('.');
    const dec = (x: string) => Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - x.length % 4) % 4)), ch => ch.charCodeAt(0));
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, dec(s), new TextEncoder().encode(`${h}.${c}`))).toBe(true);
    const claims = JSON.parse(new TextDecoder().decode(dec(c)));
    expect(claims).toMatchObject({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: NOW / 1000, exp: NOW / 1000 + 3600 });
  });
  it('redact removes tokens and bearer values', () => {
    expect(redact(`x ${TOKEN} Bearer abc.def`, [])).not.toMatch(/APA91|abc\.def/);
  });
});

describe('practice sender request handler', () => {
  const req = (init: RequestInit & { url?: string } = {}) => new Request('https://x/functions/v1/send-practice-notification', { method: 'POST', headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' }, ...init });
  it('switched off: refuses without reading login or body', async () => {
    const w = world();
    const res = await handlePracticeRequest(req({ body: '{}' }), jwt => createLiveAdapters({ supabaseUrl: URL0, anonKey: 'a', serviceRoleKey: 's', jwt, serviceAccount: null, fetch: w.fetch, enabled: false }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ sent: false, reason: 'approval_required' });
    expect(w.calls).toHaveLength(0);
  });
  it('handles preflight, wrong method, oversized and malformed bodies', async () => {
    const build = () => createLiveAdapters({ supabaseUrl: URL0, anonKey: 'a', serviceRoleKey: 's', jwt: null, serviceAccount: null, fetch: world().fetch, enabled: true });
    expect((await handlePracticeRequest(new Request('https://x', { method: 'OPTIONS' }), build)).status).toBe(200);
    expect((await handlePracticeRequest(new Request('https://x', { method: 'GET' }), build)).status).toBe(405);
    expect((await handlePracticeRequest(req({ body: 'x'.repeat(2000) }), build)).status).toBe(413);
    expect((await handlePracticeRequest(req({ body: 'not json' }), build)).status).toBe(400);
  });
  it('rejects extra fields such as a worker id or raw token', async () => {
    const w = world();
    const cfg = await config(w);
    const res = await handlePracticeRequest(req({ body: JSON.stringify({ ...(await body()), worker_id: 'someone-else' }) }), jwt => createLiveAdapters({ ...cfg, jwt }));
    expect(await res.json()).toMatchObject({ reason: 'invalid_request' });
    expect(w.calls.some(c => c.url.startsWith('https://fcm'))).toBe(false);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
  it('full request with a verified login sends once and logs no secrets', async () => {
    const w = world();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const cfg = await config(w);
    const res = await handlePracticeRequest(req({ body: JSON.stringify(await body()) }), jwt => createLiveAdapters({ ...cfg, jwt }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true, practice_id: ID });
    const logged = log.mock.calls.flat().join(' ');
    expect(logged).not.toMatch(/user-jwt|APA91|service-key|w1|11111111/);
    log.mockRestore();
  });
});

describe('staged practice journal SQL', () => {
  const sql = readFileSync('docs/test-booking-training-2026-11-11/sender/staged/sql/001_practice_push_attempts.sql', 'utf8');
  it('is server-only and practice-only', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.practice_push_attempts FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT ALL ON public\.practice_push_attempts TO service_role/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    expect(code).not.toMatch(/\b(bookings|booking_requests|booking_offer_events|workers|worker_availability|worker_payouts)\b/);
  });
});
