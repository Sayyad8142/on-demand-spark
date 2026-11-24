import { supabase } from '@/integrations/supabase/client';

/** Read-only recovery. Identity is verified by Auth, never taken from a push. */
export async function recoverOfferDeadline(bookingId: string, requestId?: string): Promise<string | null> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;
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