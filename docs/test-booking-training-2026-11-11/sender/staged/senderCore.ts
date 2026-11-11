/** Pure decision core (no I/O). Live adapters: adapters.ts; entry: send-practice-notification/.
 * Staged only; never import into the app runtime.
 */
export interface PracticeRequest { practice_id: string; expires_at: number; device_token_sha256: string }
export interface OwnDevice {
  token: string;
  tokenSha256: string;
  status: string | null;
  platform: string | null;
}
export interface PracticeSenderAdapters {
  enabled: boolean;
  now(): number;
  // Must call Supabase Auth getUser(jwt), not decode a JWT or trust an anon key.
  authenticate(): Promise<{ userId: string } | null>;
  // Resolve by verified user_id only; refuse missing/ambiguous links. No phone fallback.
  ownDevice(userId: string): Promise<OwnDevice | null>;
  // Read all active work statuses and unexpired pending offers; unknown => refuse.
  idle(userId: string): Promise<boolean>;
  // Durable atomic, user-scoped claim: one outstanding attempt per user, even
  // when a different practice_id is supplied. Never use a process-local Map.
  claim(userId: string, request: PracticeRequest): Promise<'new' | 'duplicate' | 'busy'>;
  // Practice-only journal, not workers/booking_requests/booking_offer_events.
  record(userId: string, id: string, outcome: 'provider_accepted' | 'failed' | 'unknown'): Promise<void>;
  send(message: PracticeMessage): Promise<{ ok: boolean; status: number; body: string; messageId?: string }>;
}
export interface PracticeMessage {
  message: {
    token: string;
    android: { priority: 'HIGH'; ttl: string };
    data: { type: 'PRACTICE_BOOKING'; practice_id: string; expires_at: string };
  };
}
export interface SenderResult { status: number; body: { sent: boolean; practice_id?: string; reason?: string; provider_status?: number; details?: string } }
const refuse = (status: number, reason: string): SenderResult => ({ status, body: { sent: false, reason } });

export function parsePracticeRequest(value: unknown, now: number): PracticeRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !['practice_id', 'expires_at', 'device_token_sha256'].includes(k))) return null;
  if (typeof v.practice_id !== 'string' || !/^practice-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.practice_id)) return null;
  if (typeof v.expires_at !== 'number' || !Number.isSafeInteger(v.expires_at) || v.expires_at <= now || v.expires_at > now + 60000) return null;
  if (typeof v.device_token_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(v.device_token_sha256)) return null;
  return { practice_id: v.practice_id, expires_at: v.expires_at, device_token_sha256: v.device_token_sha256 };
}

export async function preparePracticeSend(value: unknown, a: PracticeSenderAdapters): Promise<SenderResult> {
  if (!a.enabled) return refuse(503, 'approval_required');
  try {
    const session = await a.authenticate();
    if (!session?.userId) return refuse(401, 'login_required');
    const request = parsePracticeRequest(value, a.now());
    if (!request) return refuse(400, 'invalid_request');
    const device = await a.ownDevice(session.userId);
    if (!device?.token) return refuse(409, 'token_missing');
    if (device.status !== 'active') return refuse(409, 'token_invalid');
    if (device.platform !== 'android') return refuse(409, 'android_required');
    if (device.tokenSha256 !== request.device_token_sha256) return refuse(409, 'device_mismatch');
    if (!(await a.idle(session.userId))) return refuse(409, 'real_work_active');
    const claim = await a.claim(session.userId, request);
    // Unknown/duplicate is not proof of sending. Status lookup may return an
    // already-recorded provider acceptance later; this core never resends.
    if (claim !== 'new') return refuse(409, claim === 'duplicate' ? 'already_attempted' : 'attempt_in_progress');
    try {
      // Repeat immediately before provider submission. Receiver must also
      // recheck because real offers may arrive after this read.
      if (!(await a.idle(session.userId))) {
        await a.record(session.userId, request.practice_id, 'failed');
        return refuse(409, 'real_work_active');
      }
      const currentDevice = await a.ownDevice(session.userId);
      if (!currentDevice || currentDevice.token !== device.token || currentDevice.status !== 'active' || currentDevice.platform !== 'android') {
        await a.record(session.userId, request.practice_id, 'failed');
        return refuse(409, 'device_changed');
      }
      const remaining = request.expires_at - a.now();
      if (remaining <= 0) {
        await a.record(session.userId, request.practice_id, 'failed');
        return refuse(410, 'expired');
      }
      const result = await a.send({ message: {
        token: currentDevice.token,
        android: { priority: 'HIGH', ttl: `${Math.min(60, Math.floor(remaining / 1000))}s` },
        data: { type: 'PRACTICE_BOOKING', practice_id: request.practice_id, expires_at: String(request.expires_at) },
      } });
      if (!result.ok) {
        await a.record(session.userId, request.practice_id, 'failed');
        return { status: result.status, body: { sent: false, reason: 'provider_failed', provider_status: result.status, details: result.body } };
      }
      if (!result.messageId) {
        await a.record(session.userId, request.practice_id, 'unknown');
        return refuse(502, 'provider_unconfirmed');
      }
      await a.record(session.userId, request.practice_id, 'provider_accepted');
      return { status: 200, body: { sent: true, practice_id: request.practice_id } };
    } catch {
      // Network timeouts may occur after FCM accepted the request. Retain the
      // claim until expiry; no automatic retry of uncertain attempts.
      await a.record(session.userId, request.practice_id, 'unknown').catch(() => undefined);
      return refuse(503, 'delivery_unknown');
    }
  } catch {
    return refuse(503, 'safety_check_unavailable');
  }
}