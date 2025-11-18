import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface IncomingCall {
  rtcCallId: string;
  callerName: string;
}

export function useIncomingCall() {
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  useEffect(() => {
    let currentUserId: string | null = null;

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
      if (!user) {
        console.log('⚠️ No user found for incoming call subscription');
        return;
      }

      currentUserId = user.id;
      console.log('📞 Setting up realtime subscription for user:', currentUserId, '(callee only)');

      // CRITICAL: Filter ensures worker only sees calls where THEY are the callee
      // This prevents workers from receiving notifications for their own outgoing calls
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
            const call = payload.new as any;
            console.log('📞 Incoming call detected (callee filter applied):', call.id, 'Status:', call.status);
            
            if (call.status === 'ringing') {
              console.log('✅ Call is ringing for current user (callee)');
              
              // Fetch caller details
              const { data: booking } = await supabase
                .from('bookings')
                .select('cust_name')
                .eq('id', call.booking_id)
                .single();

              setIncomingCall({
                rtcCallId: call.id,
                callerName: booking?.cust_name || 'Customer',
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
