import { handlePracticeRequest } from './handler.ts';
import { preparePracticeSend, type PracticeSenderAdapters } from './senderCore.ts';

const now = 1794458160000;
const request = { practice_id: 'practice-12345678-1234-4123-8123-123456789abc', expires_at: now + 60000, device_token_sha256: 'a'.repeat(64) };
const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };
function setup(overrides: Partial<PracticeSenderAdapters> = {}) {
  const calls = { sends: 0, auth: 0, validated: false, accepted: false, validateOnly: false };
  const adapters: PracticeSenderAdapters = {
    enabled: true, now: () => now,
    authenticate: async () => { calls.auth++; return { userId: 'verified-user' }; },
    ownDevice: async () => ({ token: 'fake-token', tokenSha256: request.device_token_sha256, status: 'active', platform: 'android' }),
    idle: async () => true, claim: async () => 'new',
    record: async (_user, _id, outcome) => { calls.validated ||= outcome === 'validated'; calls.accepted ||= outcome === 'provider_accepted'; },
    send: async message => { calls.sends++; calls.validateOnly = message.validate_only === true; return { ok: true, status: 200, body: '', messageId: 'projects/test/messages/1' }; },
    ...overrides,
  };
  return { calls, adapters };
}

Deno.test('OFF refuses before authentication or provider access', async () => {
  const { calls, adapters } = setup({ enabled: false });
  const response = await handlePracticeRequest(new Request('https://example.invalid', { method: 'POST', body: JSON.stringify(request) }), () => adapters);
  assert(response.status === 503 && (await response.json()).sent === false, 'OFF must refuse');
  assert(calls.sends === 0 && calls.auth === 0, 'OFF performed work');
});
Deno.test('unverified login cannot send', async () => {
  const { calls, adapters } = setup({ authenticate: async () => null });
  const result = await preparePracticeSend(request, adapters);
  assert(result.status === 401 && calls.sends === 0, 'unverified caller reached provider');
});
Deno.test('wrong device cannot send', async () => {
  const { calls, adapters } = setup();
  const result = await preparePracticeSend({ ...request, device_token_sha256: 'b'.repeat(64) }, adapters);
  assert(result.status === 409 && result.body.reason === 'device_mismatch' && calls.sends === 0, 'wrong device reached provider');
});
Deno.test('quota refuses fourth attempt without provider access', async () => {
  const { calls, adapters } = setup({ claim: async () => 'rate_limited' });
  const result = await preparePracticeSend(request, adapters);
  assert(result.body.reason === 'rate_limited' && calls.sends === 0, 'rate limit bypassed');
});
Deno.test('validate-only never reports delivery or records provider acceptance', async () => {
  const { calls, adapters } = setup({ validateOnly: true });
  const result = await preparePracticeSend(request, adapters);
  assert(calls.sends === 1 && calls.validateOnly && calls.validated && !calls.accepted, 'validation became delivery');
  assert(result.status === 200 && result.body.sent === false && result.body.reason === 'validated_only', 'validation reported delivery');
});
Deno.test('real work always prevents provider access', async () => {
  const { calls, adapters } = setup({ idle: async () => false });
  const result = await preparePracticeSend(request, adapters);
  assert(result.body.reason === 'real_work_active' && calls.sends === 0, 'practice interfered with real work');
});