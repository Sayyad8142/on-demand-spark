import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];

export function useActiveJob(userId: string | undefined) {
  const [activeJob, setActiveJob] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchActiveJob = async () => {
    if (!userId) return;

    try {
      console.log('🔍 Fetching active job for worker:', userId);
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('worker_id', userId)
        .in('status', ['assigned', 'accepted', 'on_the_way', 'started'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      console.log('📦 Active job fetched:', data ? `Found booking ${data.id}` : 'No active job');
      setActiveJob(data);
    } catch (error) {
      console.error('❌ Error fetching active job:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveJob();

    // Subscribe to booking updates
    const channel = supabase
      .channel('active-job-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `worker_id=eq.${userId}`
        },
        (payload) => {
          const booking = payload.new as Booking;
          if (['assigned', 'accepted', 'on_the_way', 'started'].includes(booking.status)) {
            setActiveJob(booking);
          } else {
            setActiveJob(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const updateJobStatus = async (bookingId: string, newStatus: string) => {
    try {
      const { error } = await supabase.rpc('worker_set_booking_status', {
        booking_id_param: bookingId,
        new_status_param: newStatus
      });

      if (error) throw error;

      await fetchActiveJob();
      return true;
    } catch (error) {
      console.error('Error updating job status:', error);
      throw error;
    }
  };

  return { activeJob, loading, updateJobStatus, refetch: fetchActiveJob };
}