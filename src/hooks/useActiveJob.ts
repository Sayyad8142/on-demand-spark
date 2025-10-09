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
        .in('status', ['accepted', 'on_the_way', 'started'])
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
          if (['accepted', 'on_the_way', 'started'].includes(booking.status)) {
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
      const { data, error } = await supabase.rpc('update_booking_status', {
        p_booking_id: bookingId,
        p_status: newStatus
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to update booking status');
      }

      await fetchActiveJob();
      return true;
    } catch (error) {
      console.error('Error updating job status:', error);
      throw error;
    }
  };

  return { activeJob, loading, updateJobStatus, refetch: fetchActiveJob };
}