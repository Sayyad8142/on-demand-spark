import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * useAutoHeal — Background auto-fix for missing worker data.
 * 
 * On login, if service_types is empty → auto-set ['maid'].
 * If no availability slots → auto-create default 7-day slots (07:00–18:30).
 */
export function useAutoHeal(workerId: string | undefined, worker: any) {
  const healedRef = useRef(false);

  useEffect(() => {
    if (!workerId || !worker || healedRef.current) return;
    healedRef.current = true;

    const heal = async () => {
      // 1. Auto-fix empty service_types
      if (!worker.service_types || worker.service_types.length === 0) {
        console.log('🩹 [AutoHeal] service_types empty, setting default ["maid"]');
        await supabase
          .from('workers')
          .update({ service_types: ['maid'] })
          .eq('id', workerId);
      }

      // 2. Auto-fix missing availability slots
      const { data: slots } = await supabase
        .from('worker_availability')
        .select('id')
        .eq('worker_id', workerId)
        .limit(1);

      if (!slots || slots.length === 0) {
        console.log('🩹 [AutoHeal] No availability slots, creating defaults');
        const defaultSlots = [
          '07:00:00', '07:30:00', '08:00:00', '08:30:00',
          '09:00:00', '09:30:00', '10:00:00', '10:30:00',
          '11:00:00', '11:30:00', '12:00:00', '12:30:00',
          '13:00:00', '13:30:00', '14:00:00', '14:30:00',
          '15:00:00', '15:30:00', '16:00:00', '16:30:00',
          '17:00:00', '17:30:00', '18:00:00', '18:30:00',
        ];

        const rows = Array.from({ length: 7 }, (_, i) => ({
          worker_id: workerId,
          day_of_week: i,
          slots: defaultSlots,
        }));

        await supabase.from('worker_availability').upsert(rows, {
          onConflict: 'worker_id,day_of_week',
        });
      }
    };

    heal().catch((e) => console.warn('⚠️ [AutoHeal] failed:', e));
  }, [workerId, worker]);
}
