// WATCH-ONLY heartbeat identity audit. Records how a check-in proved identity.
// It never rejects, never writes to the database, never logs tokens, and any
// failure inside it is swallowed so the heartbeat behaves exactly as before.

export type AuditOutcome =
  | "no_auth_header"     // no Authorization header at all
  | "legacy_anon"        // bearer is the public anon key (old apps / expired background login)
  | "session_match"      // valid login; its worker row == body worker_id
  | "session_mismatch"   // valid login; body worker_id belongs to someone else
  | "session_no_worker"  // valid login but no worker row for that user
  | "session_invalid"    // looks like a user login but verification failed (expired / bad)
  | "missing_worker_id"  // body had no worker_id (request will get the existing 400)
  | "audit_error";       // the audit itself failed — heartbeat unaffected

export function bearerOf(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

/** Unverified role claim — used ONLY to label the request, never to authorize. */
export function jwtRole(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof json?.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

export function shortId(id: unknown): string | null {
  return typeof id === "string" && id.length > 0 ? id.slice(0, 8) : null;
}

export interface AuditDeps {
  /** Verifies a user token server-side; returns the auth user id or null. */
  verifyUser: (token: string) => Promise<string | null>;
  /** workers.id for an auth user id, or null. */
  workerIdForUser: (uid: string) => Promise<string | null>;
}

export async function classifyHeartbeat(
  authHeader: string | null,
  bodyWorkerId: unknown,
  deps: AuditDeps,
): Promise<AuditOutcome> {
  try {
    const token = bearerOf(authHeader);
    if (!token) return "no_auth_header";
    const role = jwtRole(token);
    if (role === "anon" || (role === null && token.startsWith("sb_publishable_"))) {
      return bodyWorkerId ? "legacy_anon" : "missing_worker_id";
    }
    const uid = await deps.verifyUser(token);
    if (!uid) return "session_invalid";
    const wid = await deps.workerIdForUser(uid);
    if (!wid) return "session_no_worker";
    if (!bodyWorkerId) return "missing_worker_id";
    return wid === bodyWorkerId ? "session_match" : "session_mismatch";
  } catch {
    return "audit_error";
  }
}

/** Resolves within `ms` no matter what; never throws. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });
}
