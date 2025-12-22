import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];

export function useActiveJob(userId: string | undefined) {
  const [activeJob, setActiveJob] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [workerId, setWorkerId] = useState<string | null>(null);

  // First, get the worker record ID from user_id
  const fetchWorkerId = async () => {
    if (!userId) return null;

    try {
      // Try by user_id first
      let { data } = await supabase
        .from('workers')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      // Fallback to id match (legacy workers)
      if (!data) {
        const { data: legacyData } = await supabase
          .from('workers')
          .select('id')
          .eq('id', userId)
          .maybeSingle();
        data = legacyData;
      }

      if (data) {
        console.log('✅ Found worker id:', data.id);
        setWorkerId(data.id);
        return data.id;
      }
      return null;
    } catch (error) {
      console.error('❌ Error fetching worker id:', error);
      return null;
    }
  };

  const fetchActiveJob = async (workerRecordId?: string) => {
    const wId = workerRecordId || workerId;
    if (!wId) {
      console.log('⚠️ No worker id available for active job fetch');
      setLoading(false);
      return;
    }

    try {
      console.log('🔍 Fetching active job for worker record id:', wId);
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('worker_id', wId)
        .in('status', ['assigned', 'accepted', 'on_the_way', 'started'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      console.log('📦 Active job fetched:', data ? `Found booking ${data.id}, flat: ${data.flat_no}` : 'No active job');
      setActiveJob(data);
    } catch (error) {
      console.error('❌ Error fetching active job:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const wId = await fetchWorkerId();
      if (wId) {
        await fetchActiveJob(wId);
      } else {
        setLoading(false);
      }
    };
    init();
  }, [userId]);

  // Subscribe to booking updates once we have workerId
  useEffect(() => {
    if (!workerId) return;

    const channel = supabase
      .channel('active-job-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `worker_id=eq.${workerId}`
        },
        (payload) => {
          const booking = payload.new as Booking;
          console.log('📡 Realtime booking update:', booking.id, 'status:', booking.status);
          if (['assigned', 'accepted', 'on_the_way', 'started'].includes(booking.status)) {
            setActiveJob(booking);
          } else {
            setActiveJob(null);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bookings',
          filter: `worker_id=eq.${workerId}`
        },
        (payload) => {
          const booking = payload.new as Booking;
          console.log('📡 Realtime booking insert:', booking.id, 'status:', booking.status);
          if (['assigned', 'accepted', 'on_the_way', 'started'].includes(booking.status)) {
            setActiveJob(booking);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workerId]);

  const updateJobStatus = async (bookingId: string, newStatus: string) => {
    try {
      console.log('🔄 Updating job status:', bookingId, 'to', newStatus);
      
      const { error } = await supabase.rpc('worker_set_booking_status', {
        booking_id_param: bookingId,
        new_status_param: newStatus
      });

      if (error) {
        console.error('❌ Error from worker_set_booking_status:', error);
        throw error;
      }

      console.log('✅ Status update successful');

      // If completed, immediately clear the active job for instant UI update
      if (newStatus === 'completed') {
        console.log('🎉 Clearing active job immediately');
        setActiveJob(null);
      }
      
      // Wait for database transaction to commit before refetching
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('🔄 Refetching active job after delay');
      await fetchActiveJob();
      
      return true;
    } catch (error) {
      console.error('❌ Error updating job status:', error);
      throw error;
    }
  };

  return { activeJob, loading, updateJobStatus, refetch: fetchActiveJob };
}