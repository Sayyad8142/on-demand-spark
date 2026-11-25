import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { SERVICE_PRICING_ENABLED } from '@/lib/servicePricing';
import { createHybridPayoutClient, type EarningItem, type PayoutSummary } from '@/lib/hybridPayoutApi';

/** Pricing-only readback; never enables the existing global hybrid payout UI or writes earnings. */
export function usePricingEarnings(userId: string | undefined) {
  const [state, setState] = useState<{ owner?: string; summary: PayoutSummary | null; items: EarningItem[]; cursor: string | null; loading: boolean; error: boolean }>({ summary: null, items: [], cursor: null, loading: false, error: false });
  const seq = useRef(0);
  const busy = useRef(false);
  const refresh = useCallback(async (cursor: string | null = null) => {
    if (cursor && busy.current) return;
    const ticket = ++seq.current;
    if (!userId || !SERVICE_PRICING_ENABLED) { setState({ owner: userId, summary: null, items: [], cursor: null, loading: false, error: false }); return; }
    busy.current = true;
    setState(s => ({ ...s, loading: true, error: false }));
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || user?.id !== userId) throw new Error('session');
      const client = createHybridPayoutClient(undefined, SERVICE_PRICING_ENABLED);
      const [summary, page] = await Promise.all([client.getSummary(), client.getEarnings(null, cursor)]);
      if (ticket === seq.current) setState(s => ({ owner: userId, summary,
        items: cursor && s.owner === userId ? [...s.items, ...page.items.filter(i => !s.items.some(old => old.earningId === i.earningId))] : page.items,
        cursor: page.nextCursor === cursor ? null : page.nextCursor, loading: false, error: false }));
    } catch {
      if (ticket === seq.current) setState({ owner: userId, summary: null, items: [], cursor: null, loading: false, error: true });
    } finally { if (ticket === seq.current) busy.current = false; }
  }, [userId]);
  useEffect(() => {
    void refresh();
    const foreground = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', foreground); window.addEventListener('online', foreground);
    let disposed = false; let remove: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) void App.addListener('resume', foreground).then(h => { if (disposed) void h.remove(); else remove = () => { void h.remove(); }; }).catch(() => {});
    return () => { disposed = true; ++seq.current; busy.current = false; remove?.(); document.removeEventListener('visibilitychange', foreground); window.removeEventListener('online', foreground); };
  }, [refresh]);
  return { ...state, summary: state.owner === userId ? state.summary : null, items: state.owner === userId ? state.items : [],
    refresh: () => refresh(), loadMore: () => state.owner === userId && state.cursor ? refresh(state.cursor) : Promise.resolve() };
}