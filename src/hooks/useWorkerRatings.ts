import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';
import { fetchCompletedReviews, fetchRatingSummary } from '@/lib/workerRatings';

/** Read-only and account-keyed; events invalidate values, never trust event payloads. */
export function useWorkerRatings(workerId: string | null | undefined, includeReviews = false) {
  const client = useQueryClient();
  const summary = useQuery({
    queryKey: ['worker-rating-summary', workerId],
    queryFn: () => workerId ? fetchRatingSummary(workerId) : Promise.reject(new Error('No worker')),
    enabled: !!workerId, staleTime: 0, refetchOnMount: 'always',
    refetchInterval: 30_000, refetchIntervalInBackground: false,
  });
  const reviews = useQuery({
    queryKey: ['worker-completed-reviews', workerId],
    queryFn: () => workerId ? fetchCompletedReviews(workerId) : Promise.reject(new Error('No worker')),
    enabled: !!workerId && includeReviews, staleTime: 0, refetchOnMount: 'always',
    refetchInterval: includeReviews ? 30_000 : false, refetchIntervalInBackground: false,
  });
  useEffect(() => {
    if (!workerId) return;
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ['worker-rating-summary', workerId] });
      void client.invalidateQueries({ queryKey: ['worker-completed-reviews', workerId] });
    };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', refresh);
    window.addEventListener('bookingCompleted', refresh);
    let disposed = false;
    let native: { remove: () => Promise<void> } | undefined;
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => { if (isActive) refresh(); })
        .then(h => { if (disposed) void h.remove(); else native = h; }).catch(() => undefined);
    }
    // No rating payload subscription: pre-completion individual feedback must not enter the phone.
    const channel = supabase.channel(`rating-refresh-${workerId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workers', filter: `id=eq.${workerId}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `worker_id=eq.${workerId}` }, refresh)
      .subscribe();
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', refresh);
      window.removeEventListener('bookingCompleted', refresh);
      void native?.remove();
      void supabase.removeChannel(channel);
    };
  }, [workerId, client]);
  return { summary, reviews };
}