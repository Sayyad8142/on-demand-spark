/**
 * Pure notification-health rules (display + repair trigger only).
 *
 * Healthy ONLY when:
 *  - notification permission is granted,
 *  - the server has a token for this worker that is not marked invalid,
 *  - and, when the phone's current token is known, it is the SAME token
 *    the server will send to. A mismatch means bookings go to a dead token.
 */
export interface PushHealthInput {
  permissionGranted: boolean;
  phoneToken: string | null;
  backendToken: string | null;
  backendStatus: string | null;
}

export interface PushHealthResult {
  tokenExists: boolean;
  tokenSyncedToBackend: boolean;
  tokenMismatch: boolean;
  tokenHealthy: boolean;
  isHealthy: boolean;
}

export function evaluatePushHealth(input: PushHealthInput): PushHealthResult {
  const phone = input.phoneToken?.trim() || null;
  const backend = input.backendToken?.trim() || null;
  const tokenExists = !!(phone || backend);
  const tokenMismatch = !!(phone && backend && phone !== backend);
  // A phone token the server doesn't have yet is "not synced".
  const tokenSyncedToBackend = !!backend && !tokenMismatch;
  const tokenHealthy = tokenSyncedToBackend && input.backendStatus !== "invalid";
  return {
    tokenExists,
    tokenSyncedToBackend,
    tokenMismatch,
    tokenHealthy,
    isHealthy: input.permissionGranted && tokenExists && tokenHealthy,
  };
}
