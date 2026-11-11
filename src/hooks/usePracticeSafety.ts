import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ACTIVE_WORK_STATUSES } from '@/lib/workSafety';
// Read only. Do not use profile auto-heal or any booking mutation in training.
export function usePracticeSafety(userId: string | undefined, guest: boolean) {
  const localGuest = guest && !userId;
  const [safe, setSafe] = useState(localGuest);
  const [checking, setChecking] = useState(!localGuest);
  const [worker, setWorker] = useState<{ id: string; fcm_token_status: string | null; fcm_token: string | null } | null>(null);
  const refresh = useCallback(async (): Promise<boolean> => {
    if (localGuest) { setSafe(true); setChecking(false); return true; }
    if (!userId) { setSafe(false); setChecking(false); return false; }
    try {
      const columns = 'id, fcm_token_status, fcm_token';
      const primary = await supabase.from('workers').select(columns).eq('user_id', userId).maybeSingle();
      if (primary.error) throw primary.error;
      const resolved = primary.data ? primary : await supabase.from('workers').select(columns).eq('id', userId).maybeSingle();
      if (resolved.error || !resolved.data) throw new Error('Worker not found');
      setWorker(resolved.data);
      const [jobs, offers] = await Promise.all([
        supabase.from('bookings').select('id').eq('worker_id', resolved.data.id).in('status', [...ACTIVE_WORK_STATUSES]).limit(1),
        supabase.from('booking_requests').select('id').eq('worker_id', resolved.data.id).eq('status', 'pending').gt('timeout_at', new Date().toISOString()).limit(1),
      ]);
      if (jobs.error || offers.error) throw new Error('Unable to check active work');
      const idle = jobs.data.length === 0 && offers.data.length === 0;
      setSafe(idle); return idle;
    } catch { setSafe(false); return false; }
    finally { setChecking(false); }
  }, [userId, localGuest]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 5000);
    const foreground = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', foreground);
    if (!userId || localGuest) return () => { clearInterval(timer); document.removeEventListener('visibilitychange', foreground); };
    const channel = supabase.channel(`practice-safety-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_requests' }, () => { void refresh(); }).subscribe();
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', foreground); void supabase.removeChannel(channel); };
  }, [refresh, localGuest, userId]);
  return { safe, checking, worker, refresh };
}