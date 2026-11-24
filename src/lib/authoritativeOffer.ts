import { supabase } from '@/integrations/supabase/client';
import { FAVORITE_V1_STATUS_ENABLED, OFFER_STATUS_RPC } from '@/lib/offerAcceptanceContract';
import { favoriteLocalDeadline, parseFavoriteOfferStatus } from '@/lib/favoriteOfferStatus';

/** Read-only recovery. Identity is verified by Auth, never taken from a push. */
export async function recoverOfferDeadline(
  bookingId: string, requestId?: string, favoriteV1 = FAVORITE_V1_STATUS_ENABLED,
): Promise<string | null> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;
  if (favoriteV1) {
    // Session-derived on the server; only the booking id is sent. No fallback.
    const { data, error } = await (supabase.rpc as any)(OFFER_STATUS_RPC, { p_booking_id: bookingId });
    if (error) return null;
    const status = parseFavoriteOfferStatus(data, { bookingId, requestId });
    const deadline = status && favoriteLocalDeadline(status, Date.now());
    return deadline ? new Date(deadline).toISOString() : null;
  }
  const { data: worker, error: workerError } = await supabase.from('workers')
    .select('id').eq('user_id', user.id).maybeSingle();
  if (workerError || !worker) return null;
  let query = supabase.from('booking_requests').select('id,status,timeout_at')
    .eq('booking_id', bookingId).eq('worker_id', worker.id);
  if (requestId) query = query.eq('id', requestId);
  const { data: offer, error } = await query.maybeSingle();
  const deadline = Date.parse(offer?.timeout_at ?? '');
  if (error || !offer || !['pending', 'sent', 'queued'].includes(offer.status)
    || !Number.isFinite(deadline) || deadline <= Date.now()) return null;
  return new Date(deadline).toISOString();
}
