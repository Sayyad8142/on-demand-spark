import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface IncomingCall {
  rtcCallId: string;
  callerName: string;
}

export function useIncomingCall() {
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  useEffect(() => {
    // Listen for FCM messages (native only)
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'INCOMING_RTC_CALL') {
        console.log('📞 Received incoming call event from FCM:', event.data);
        setIncomingCall({
          rtcCallId: event.data.rtcCallId,
          callerName: event.data.callerName || 'Unknown Caller',
        });
      }
    };

    window.addEventListener('message', handleMessage);

    // Set up realtime subscription for incoming calls (works on web)
    let subscription: any;
    
    const setupRealtimeSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log('📞 Setting up realtime subscription for incoming calls');

      subscription = supabase
        .channel('incoming-calls')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'rtc_calls',
            filter: `callee_id=eq.${user.id}`,
          },
          async (payload) => {
            console.log('📞 Received incoming call from realtime:', payload);
            
            if (payload.new.status === 'ringing') {
              // Fetch caller details
              const { data: booking } = await supabase
                .from('bookings')
                .select('worker_name')
                .eq('id', payload.new.booking_id)
                .single();

              setIncomingCall({
                rtcCallId: payload.new.id,
                callerName: booking?.worker_name || 'Unknown Caller',
              });
            }
          }
        )
        .subscribe();
    };

    setupRealtimeSubscription();

    return () => {
      window.removeEventListener('message', handleMessage);
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, []);

  const dismissCall = () => {
    setIncomingCall(null);
  };

  return { incomingCall, dismissCall };
}
