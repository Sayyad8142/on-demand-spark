/**
 * Worker account-linkage rules (display + decision only).
 * The server alone links a login to a worker. A matching phone number is never
 * enough to take over a worker record; that needs an admin-approved recovery.
 */
export const ACCOUNT_RECOVERY_REQUIRED = "ACCOUNT_RECOVERY_REQUIRED";
export const ACCOUNT_RECOVERY_MESSAGE =
  "This phone number is already linked to another Didi Now account. Please contact Didi Now support to recover your account.";

/** True when ensure_worker_profile says the login must go through admin recovery. */
export function isAccountRecoveryRequired(result: unknown): boolean {
  return !!result && typeof result === "object" && (result as { code?: unknown }).code === ACCOUNT_RECOVERY_REQUIRED;
}

/** Server refusal raised by the staged identity guard (any identity field). */
export function isIdentityLocked(err: unknown): boolean {
  const m = err && typeof err === "object" ? String((err as { message?: unknown }).message ?? "") : "";
  return m.startsWith("WORKER_IDENTITY_LOCKED:");
}

/**
 * Sign-up may only update a worker row that already belongs to this login.
 * A row found by phone that belongs to another login must never be overwritten.
 */
export function signupMayUpdateExisting(existing: { id?: string | null; user_id?: string | null } | null, authUid: string): boolean {
  if (!existing) return false;
  return existing.id === authUid || existing.user_id === authUid;
}
