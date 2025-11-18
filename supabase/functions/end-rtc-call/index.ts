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

    const { rtc_call_id, reason } = await req.json();
    if (!rtc_call_id) {
      throw new Error('rtc_call_id is required');
    }

    console.log('📴 Ending RTC call:', rtc_call_id, 'Reason:', reason);

    // Get call record
    const { data: rtcCall, error: callError } = await supabase
      .from('rtc_calls')
      .select('*')
      .eq('id', rtc_call_id)
      .or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`)
      .single();

    if (callError || !rtcCall) {
      throw new Error('Call not found or unauthorized');
    }

    console.log('📋 Current call status:', rtcCall.status);

    // Check if call can be ended
    if (['completed', 'rejected', 'no_answer', 'cancelled', 'missed'].includes(rtcCall.status)) {
      console.log('⚠️ Call already ended with status:', rtcCall.status);
      return new Response(
        JSON.stringify({ success: true, message: 'Call already ended' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate duration if call was active
    let duration_sec = null;
    if (rtcCall.started_at) {
      const started = new Date(rtcCall.started_at).getTime();
      const ended = new Date().getTime();
      duration_sec = Math.floor((ended - started) / 1000);
    }

    // Determine final status based on current state and reason
    let finalStatus = 'completed';
    if (reason === 'rejected') {
      finalStatus = 'rejected';
    } else if (reason === 'missed' || reason === 'no_answer') {
      finalStatus = 'missed';
    } else if (reason === 'cancelled') {
      finalStatus = 'cancelled';
    }

    console.log('🔄 Updating call to status:', finalStatus, 'Duration:', duration_sec);

    // Update call record
    const { error: updateError } = await supabase
      .from('rtc_calls')
      .update({
        status: finalStatus,
        ended_at: new Date().toISOString(),
        duration_sec,
      })
      .eq('id', rtc_call_id);

    if (updateError) {
      throw updateError;
    }

    console.log('✅ Call ended:', rtc_call_id, 'Duration:', duration_sec, 'sec');

    return new Response(
      JSON.stringify({ success: true, duration_sec }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error ending call:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
