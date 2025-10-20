import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type Booking = Database['public']['Tables']['bookings']['Row'];

interface UseRealtimeBookingsOptions {
  workerId: string | undefined;
  communityId: string | undefined;
  serviceTypes: string[] | undefined;
  enabled: boolean;
  onNewBooking?: (booking: Booking) => void;
}

export function useRealtimeBookings({
  workerId,
  communityId,
  serviceTypes,
  enabled,
  onNewBooking,
}: UseRealtimeBookingsOptions) {
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);

  useEffect(() => {
    if (!workerId || !enabled || !serviceTypes || !communityId) {
      return;
    }

    console.log('🔔 Setting up realtime booking subscription', {
      workerId,
      communityId,
      serviceTypes,
    });

    const channel = supabase
      .channel('worker-bookings')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bookings',
          filter: `status=eq.pending`,
        },
        (payload) => {
          const booking = payload.new as Booking;
          console.log('📥 New booking received:', booking);

          // Check if booking matches worker's criteria
          const matchesService = serviceTypes.includes(booking.service_type);
          const matchesCommunity = booking.community === communityId;

          if (matchesService && matchesCommunity) {
            console.log('✅ Booking matches worker criteria');
            setPendingBookings((prev) => [...prev, booking]);
            onNewBooking?.(booking);
          } else {
            console.log('❌ Booking does not match criteria', {
              matchesService,
              matchesCommunity,
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status:', status);
      });

    return () => {
      console.log('🔕 Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [workerId, communityId, serviceTypes, enabled, onNewBooking]);

  const removeBooking = (bookingId: string) => {
    setPendingBookings((prev) => prev.filter((b) => b.id !== bookingId));
  };

  return {
    pendingBookings,
    removeBooking,
  };
}
