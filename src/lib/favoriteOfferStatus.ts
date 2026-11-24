/**
 * Strict parser for the proposed favorite-v1 offer status contract.
 * Shared by the status read and the additive `offer` block of
 * try_accept_booking. Anything malformed or mismatched → null (never actionable).
 */
export interface FavoriteOfferStatus {
  bookingId: string;
  requestId: string;
  generation: number;
  status: 'pending' | 'sent' | 'queued' | 'accepted' | 'rejected' | 'expired' | 'lost' | 'cancelled';
  actionable: boolean;
  /** Original server expiry — never moved by resend, reopen or retry. */
  expiresAt: number;
  serverTime: number;
}

const STATUSES = new Set(['pending', 'sent', 'queued', 'accepted', 'rejected', 'expired', 'lost', 'cancelled']);
const OPEN = new Set(['pending', 'sent', 'queued']);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
const time = (v: unknown) => (typeof v === 'string' && ISO.test(v) ? Date.parse(v) : NaN);

export function parseFavoriteOfferStatus(
  input: unknown,
  expected: { bookingId: string; requestId?: string },
): FavoriteOfferStatus | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const r = input as Record<string, unknown>;
  if (r.contract_version !== 'favorite-v1') return null;
  if (typeof r.booking_id !== 'string' || r.booking_id !== expected.bookingId) return null;
  if (typeof r.request_id !== 'string' || !r.request_id) return null;
  if (expected.requestId && r.request_id !== expected.requestId) return null;
  if (typeof r.offer_generation !== 'number' || !Number.isInteger(r.offer_generation) || r.offer_generation < 1) return null;
  if (typeof r.status !== 'string' || !STATUSES.has(r.status)) return null;
  if (typeof r.actionable !== 'boolean') return null;
  const expiresAt = time(r.expires_at);
  const serverTime = time(r.server_time);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(serverTime)) return null;
  // Server must not claim actionable for a closed or already-expired offer.
  if (r.actionable && (!OPEN.has(r.status) || expiresAt <= serverTime)) return null;
  return {
    bookingId: r.booking_id, requestId: r.request_id, generation: r.offer_generation,
    status: r.status as FavoriteOfferStatus['status'], actionable: r.actionable, expiresAt, serverTime,
  };
}

/**
 * Phone-clock deadline from the server's remaining time (corrects clock skew).
 * Never later than an original deadline the phone already holds.
 */
export function favoriteLocalDeadline(s: FavoriteOfferStatus, receivedAt: number, originalDeadline?: number): number | null {
  if (!s.actionable) return null;
  const local = receivedAt + (s.expiresAt - s.serverTime);
  const capped = originalDeadline !== undefined && Number.isFinite(originalDeadline) ? Math.min(local, originalDeadline) : local;
  return capped > receivedAt ? capped : null;
}
