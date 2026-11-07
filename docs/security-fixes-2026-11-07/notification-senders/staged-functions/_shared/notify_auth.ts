// STAGED — NOT DEPLOYED. Copy to supabase/functions/_shared/notify_auth.ts only
// after owner approval (saving under supabase/functions/ auto-deploys).
//
// Who may ask send-fcm / send-webpush to notify workers:
//   1. server-to-server: a verified JWT whose role is service_role
//      (dispatch, notify-next-tier, watchdog, keepalive, DB triggers via pg_net)
//   2. an admin user (verified JWT + is_admin()/has_role admin) — Admin Panel tools
//   3. a signed-in worker sending a TEST push to ONLY their own device
// Everyone else (anon key, other workers, no token) is refused.
//
// MODE:
//   "observe" — never refuses; logs what WOULD be refused (phase 1, find callers)
//   "enforce" — refuses unauthorised calls with 401/403 (phase 3)

export type NotifyAuthMode = "observe" | "enforce";

export interface VerifiedCaller {
  /** null when the token could not be verified */
  role: string | null; // "service_role" | "authenticated" | "anon"
  userId: string | null; // JWT sub
  isAdmin: boolean;
  /** worker ids that belong to this user (resolved server-side) */
  ownWorkerIds: string[];
  /** true when the x-internal-key header matched DISPATCH_INTERNAL_KEY (DB triggers via pg_net) */
  internalKeyValid?: boolean;
}

export interface NotifyRequest {
  workerIds: string[];
  type: string; // data.type, e.g. BOOKING_ALERT, BOOKING_CANCELLED, TEST_PUSH
}

export type NotifyDecision =
  | { allow: true; reason: string }
  | { allow: false; status: 401 | 403; reason: string };

const SELF_TEST_TYPES = new Set(["TEST_PUSH", "SELF_TEST"]);

export function decideNotifyAccess(caller: VerifiedCaller | null, req: NotifyRequest): NotifyDecision {
  if (caller?.internalKeyValid) return { allow: true, reason: "internal_key" };
  if (!caller || !caller.role) return { allow: false, status: 401, reason: "no_verified_token" };
  if (caller.role === "service_role") return { allow: true, reason: "service_role" };
  if (caller.role !== "authenticated" || !caller.userId) {
    return { allow: false, status: 403, reason: `role_${caller.role}` };
  }
  if (caller.isAdmin) return { allow: true, reason: "admin" };
  const own = new Set(caller.ownWorkerIds);
  const onlySelf = req.workerIds.length > 0 && req.workerIds.every((id) => own.has(id));
  if (onlySelf && SELF_TEST_TYPES.has(req.type)) return { allow: true, reason: "self_test" };
  return { allow: false, status: 403, reason: onlySelf ? "self_non_test_type" : "other_workers" };
}

/** Applies the rollout mode: observe never blocks, enforce does. */
export function applyMode(decision: NotifyDecision, mode: NotifyAuthMode): { block: boolean; log: string | null } {
  if (decision.allow) return { block: false, log: null };
  return { block: mode === "enforce", log: `notify_auth_${mode}_refuse:${decision.reason}` };
}

/** Constant-time compare for the x-internal-key header. Empty/missing never matches. */
export function internalKeyMatches(given: string | null | undefined, expected: string | null | undefined): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
