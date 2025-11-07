import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { booking_id } = await req.json();
    if (!booking_id) {
      throw new Error('booking_id is required');
    }

    console.log('📞 Creating RTC call for booking:', booking_id);

    // Get booking details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*, user_id')
      .eq('id', booking_id)
      .eq('worker_id', user.id)
      .single();

    if (bookingError || !booking) {
      throw new Error('Booking not found or unauthorized');
    }

    // Create Daily.co room
    const DAILY_API_KEY = Deno.env.get('DAILY_API_KEY');
    if (!DAILY_API_KEY) {
      throw new Error('DAILY_API_KEY not configured');
    }

    const roomName = `call-${booking_id}-${Date.now()}`;
    
    // Create room
    const roomResponse = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: roomName,
        properties: {
          max_participants: 2,
          enable_chat: false,
          enable_screenshare: false,
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiry
        },
      }),
    });

    if (!roomResponse.ok) {
      const error = await roomResponse.text();
      console.error('❌ Daily.co room creation failed:', error);
      throw new Error('Failed to create room');
    }

    const room = await roomResponse.json();
    console.log('✅ Room created:', room.name);

    // Create caller token
    const callerTokenResponse = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          is_owner: true,
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      }),
    });

    if (!callerTokenResponse.ok) {
      throw new Error('Failed to create caller token');
    }

    const callerToken = await callerTokenResponse.json();

    // Create callee token
    const calleeTokenResponse = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          is_owner: false,
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      }),
    });

    if (!calleeTokenResponse.ok) {
      throw new Error('Failed to create callee token');
    }

    const calleeToken = await calleeTokenResponse.json();

    // Insert call record
    const { data: rtcCall, error: insertError } = await supabase
      .from('rtc_calls')
      .insert({
        booking_id,
        caller_id: user.id,
        callee_id: booking.user_id,
        room_id: room.url,
        caller_token: callerToken.token,
        callee_token: calleeToken.token,
        status: 'ringing',
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to insert call:', insertError);
      throw insertError;
    }

    // Send FCM notification to user
    const { data: fcmTokenData } = await supabase
      .from('fcm_tokens')
      .select('token')
      .eq('user_id', booking.user_id)
      .single();

    if (fcmTokenData?.token) {
      console.log('📲 Sending incoming call notification to user');
      await supabase.functions.invoke('send-fcm', {
        body: {
          workerIds: [booking.user_id],
          title: 'Incoming Call',
          body: `${booking.worker_name || 'Worker'} is calling you`,
          data: {
            type: 'incoming_rtc',
            rtc_call_id: rtcCall.id,
            caller_name: booking.worker_name || 'Worker',
            booking_id,
          },
        },
      });
    }

    console.log('✅ Call created successfully:', rtcCall.id);

    return new Response(
      JSON.stringify({
        rtc_call_id: rtcCall.id,
        room_url: room.url,
        caller_token: callerToken.token,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error creating call:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
