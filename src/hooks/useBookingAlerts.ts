import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];

export function useBookingAlerts(userId: string | undefined, isOnline: boolean) {
  const [pendingBooking, setPendingBooking] = useState<Booking | null>(null);

  useEffect(() => {
    if (!userId || !isOnline) return;

    // Subscribe to new pending bookings
    const channel = supabase
      .channel('booking-alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bookings',
          filter: 'status=eq.pending'
        },
        async (payload) => {
          console.log('New booking:', payload);
          const booking = payload.new as Booking;

          // Check if this booking matches worker's service/community
          const { data: worker } = await supabase
            .from('workers')
            .select('service_types, communities, community, is_available, is_busy')
            .eq('id', userId)
            .single();

          if (worker && worker.is_available) {
            const matchesService = worker.service_types?.includes(booking.service_type);
            const matchesCommunity = 
              worker.communities?.includes(booking.community) ||
              worker.community === booking.community;

            if (matchesService && matchesCommunity) {
              setPendingBooking(booking);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, isOnline]);

  const clearAlert = () => setPendingBooking(null);

  return { pendingBooking, clearAlert };
}