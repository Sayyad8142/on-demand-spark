/** Final favorite-v1 reader; invalid data can never authorize acceptance. */
export const OFFER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isOfferUuid = (v: unknown): v is string => typeof v === 'string' && OFFER_UUID.test(v);
export interface FavoriteOfferStatus {
  bookingId: string;
  requestId: string | null;
  generation: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'expired' | 'lost' | 'cancelled';
  favoriteState: 'preparing' | 'holding' | 'fallback_pending' | 'fallback' | 'accepted' | 'cancelled' | null;
  offerState: 'holding' | 'accepted' | 'closed';
  actionable: boolean;
  expiresAt: number;
  serverTime: number;
}
const STATUSES = new Set(['pending', 'accepted', 'rejected', 'expired', 'lost', 'cancelled']);
const FAVORITE = new Set(['preparing', 'holding', 'fallback_pending', 'fallback', 'accepted', 'cancelled']);
const OFFER = new Set(['holding', 'accepted', 'closed']);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
const time = (v: unknown) => typeof v === 'string' && ISO.test(v) ? Date.parse(v) : NaN;
export function parseFavoriteOfferStatus(input: unknown, expected: { bookingId: string; requestId?: string }): FavoriteOfferStatus | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const r = input as Record<string, unknown>;
  if (r.contract_version !== 'favorite-v1' || r.booking_id !== expected.bookingId) return null;
  if (r.request_id !== null && !isOfferUuid(r.request_id)) return null;
  if (expected.requestId && r.request_id !== expected.requestId) return null;
  // Generation is copied, never inferred from redelivery count or an ID.
  if (r.offer_generation !== null && (!isOfferUuid(r.offer_generation) || r.offer_generation !== r.request_id)) return null;
  if (r.offer_id !== undefined && r.offer_id !== r.request_id) return null;
  if (typeof r.status !== 'string' || !STATUSES.has(r.status) || typeof r.actionable !== 'boolean') return null;
  if (r.favorite_state !== null && (typeof r.favorite_state !== 'string' || !FAVORITE.has(r.favorite_state))) return null;
  if (typeof r.offer_state !== 'string' || !OFFER.has(r.offer_state)) return null;
  const expiresAt = time(r.expires_at), serverTime = time(r.server_time);
  if (!Number.isFinite(serverTime)) return null;
  if (r.expires_at !== null && !Number.isFinite(expiresAt)) return null;
  if (r.actionable && (r.status !== 'pending' || r.offer_state !== 'holding' ||
    !isOfferUuid(r.request_id) || !isOfferUuid(r.offer_generation) || !Number.isFinite(expiresAt) || expiresAt <= serverTime ||
    (r.favorite_state !== null && !['holding', 'fallback'].includes(r.favorite_state as string)))) return null;
  return { bookingId: expected.bookingId, requestId: r.request_id as string | null, generation: r.offer_generation as string | null,
    status: r.status as FavoriteOfferStatus['status'], favoriteState: r.favorite_state as FavoriteOfferStatus['favoriteState'],
    offerState: r.offer_state as FavoriteOfferStatus['offerState'], actionable: r.actionable, expiresAt, serverTime };
}
/** Correct phone-clock skew, but never extend a deadline already held. */
export function favoriteLocalDeadline(s: FavoriteOfferStatus, receivedAt: number, originalDeadline?: number): number | null {
  if (!s.actionable) return null;
  const local = receivedAt + (s.expiresAt - s.serverTime);
  const capped = originalDeadline !== undefined && Number.isFinite(originalDeadline) ? Math.min(local, originalDeadline) : local;
  return Number.isFinite(capped) && capped > receivedAt ? capped : null;
}
