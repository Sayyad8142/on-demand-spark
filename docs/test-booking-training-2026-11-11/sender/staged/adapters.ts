/** Staged live adapters for the practice sender. Not deployed, not imported by the app.
 * All I/O goes through an injected fetch so every path is testable offline.
 * Never logs or returns raw FCM tokens, JWTs or service-account material.
 */
import type { OwnDevice, PracticeMessage, PracticeRequest, PracticeSenderAdapters } from './senderCore.ts';

// Must equal src/lib/workSafety.ts ACTIVE_WORK_STATUSES (a test enforces this).
export const PRACTICE_ACTIVE_WORK_STATUSES = ['assigned', 'accepted', 'on_the_way', 'started', 'in_progress'] as const;
export const FCM_TIMEOUT_MS = 8000;

export interface ServiceAccount { project_id: string; client_email: string; private_key: string }
export interface AdapterConfig {
  enabled: boolean;
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  jwt: string | null;
  serviceAccount: ServiceAccount | null;
  fetch: typeof fetch;
  now?: () => number;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Removes anything that looks like an FCM registration token or bearer token. */
export function redact(text: string, secrets: Array<string | null | undefined> = []): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 8) out = out.split(s).join('[redacted]');
  return out.replace(/[A-Za-z0-9_-]{20,}:[A-Za-z0-9_-]{60,}/g, '[redacted-token]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .slice(0, 500);
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const b64urlText = (text: string) => b64url(new TextEncoder().encode(text));

export async function googleAccessToken(sa: ServiceAccount, f: typeof fetch, nowMs: number): Promise<string> {
  const now = Math.floor(nowMs / 1000);
  const input = `${b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64urlText(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))}`;
  const pem = sa.private_key.replace(/\\n/g, '\n').replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input)));
  const res = await f('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${input}.${b64url(signature)}` }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || typeof body.access_token !== 'string') throw new Error(`google_oauth_failed [${res.status}]`);
  return body.access_token;
}

interface WorkerRow { id: string; fcm_token: string | null; fcm_token_status: string | null; fcm_token_platform: string | null }

export function createLiveAdapters(c: AdapterConfig): PracticeSenderAdapters {
  const now = c.now ?? (() => Date.now());
  const service = { apikey: c.serviceRoleKey, Authorization: `Bearer ${c.serviceRoleKey}` };
  let verifiedUser: string | null = null;
  let cachedAccess: string | null = null;

  const rest = async (path: string) => {
    const res = await c.fetch(`${c.supabaseUrl}/rest/v1/${path}`, { headers: { ...service, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`read_failed [${res.status}]`);
    return res.json() as Promise<unknown[]>;
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const res = await c.fetch(`${c.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { ...service, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`rpc_failed [${res.status}]`);
    return res.json();
  };
  // Exactly one worker linked by the verified user id. No id= or phone fallback here:
  // practice delivery must never reach a worker the login is not linked to.
  const worker = async (userId: string): Promise<WorkerRow | null> => {
    if (userId !== verifiedUser) return null;
    const rows = await rest(`workers?user_id=eq.${encodeURIComponent(userId)}&select=id,fcm_token,fcm_token_status,fcm_token_platform&limit=2`) as WorkerRow[];
    return rows.length === 1 ? rows[0] : null;
  };

  return {
    enabled: c.enabled,
    now,
    async authenticate() {
      if (!c.jwt || c.jwt === c.anonKey) return null;
      const res = await c.fetch(`${c.supabaseUrl}/auth/v1/user`, { headers: { apikey: c.anonKey, Authorization: `Bearer ${c.jwt}` } });
      if (!res.ok) return null;
      const user = await res.json().catch(() => null) as { id?: unknown } | null;
      if (!user || typeof user.id !== 'string' || !user.id) return null;
      verifiedUser = user.id;
      return { userId: user.id };
    },
    async ownDevice(userId): Promise<OwnDevice | null> {
      const w = await worker(userId);
      if (!w?.fcm_token) return null;
      return { token: w.fcm_token, tokenSha256: await sha256Hex(w.fcm_token), status: w.fcm_token_status, platform: w.fcm_token_platform };
    },
    async idle(userId) {
      const w = await worker(userId);
      if (!w) return false;
      const id = encodeURIComponent(w.id);
      const [jobs, offers] = await Promise.all([
        rest(`bookings?worker_id=eq.${id}&status=in.(${PRACTICE_ACTIVE_WORK_STATUSES.join(',')})&select=id&limit=1`),
        rest(`booking_requests?worker_id=eq.${id}&status=eq.pending&timeout_at=gt.${encodeURIComponent(new Date(now()).toISOString())}&select=id&limit=1`),
      ]);
      return Array.isArray(jobs) && Array.isArray(offers) && jobs.length === 0 && offers.length === 0;
    },
    async claim(userId, request: PracticeRequest) {
      const out = await rpc('claim_practice_push_attempt', {
        p_user_id: userId, p_practice_id: request.practice_id,
        p_expires_at: new Date(request.expires_at).toISOString(), p_token_sha256: request.device_token_sha256,
      });
      return out === 'new' || out === 'duplicate' || out === 'busy' ? out : 'busy';
    },
    async record(userId, id, outcome) {
      await rpc('record_practice_push_outcome', { p_user_id: userId, p_practice_id: id, p_outcome: outcome });
    },
    async send(message: PracticeMessage) {
      if (!c.serviceAccount) return { ok: false, status: 503, body: 'sender_not_configured' };
      cachedAccess ??= await googleAccessToken(c.serviceAccount, c.fetch, now());
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FCM_TIMEOUT_MS);
      try {
        const res = await c.fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(c.serviceAccount.project_id)}/messages:send`, {
          method: 'POST', signal: controller.signal,
          headers: { Authorization: `Bearer ${cachedAccess}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });
        const text = await res.text();
        const body = redact(text, [message.message.token, cachedAccess]);
        if (!res.ok) return { ok: false, status: res.status, body };
        const name = (() => { try { return JSON.parse(text).name; } catch { return undefined; } })();
        return { ok: true, status: res.status, body: '', messageId: typeof name === 'string' && name ? name : undefined };
      } finally { clearTimeout(timer); }
    },
  };
}
