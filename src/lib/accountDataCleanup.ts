/** Only account-specific state; preserve language and unrelated preferences. */
export const ACCOUNT_STORAGE_KEYS = [
  "didi-worker-session", "didi_session", "sb-paywwbuqycovjopryele-auth-token",
  "didi-worker-auth-draft-v1", "didi_otp_verify_state", "guest_mode", "demo_mode",
] as const;

export function clearAccountBrowserData(local: Pick<Storage, "removeItem"> = localStorage, session: Pick<Storage, "removeItem"> = sessionStorage): void {
  for (const key of ACCOUNT_STORAGE_KEYS) {
    local.removeItem(key);
    session.removeItem(key);
  }
}

export function confirmedMissingWorker(first: { data: unknown; error: unknown }, second: { data: unknown; error: unknown }): boolean {
  return !first.error && !second.error && first.data === null && second.data === null;
}