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

    const { rtc_call_id } = await req.json();
    if (!rtc_call_id) {
      throw new Error('rtc_call_id is required');
    }

    console.log('✅ Accepting RTC call:', rtc_call_id);

    // Get call record
    const { data: rtcCall, error: callError } = await supabase
      .from('rtc_calls')
      .select('*')
      .eq('id', rtc_call_id)
      .eq('callee_id', user.id)
      .single();

    if (callError || !rtcCall) {
      throw new Error('Call not found or unauthorized');
    }

    if (rtcCall.status !== 'ringing') {
      throw new Error('Call is not ringing');
    }

    // Update call status
    const { error: updateError } = await supabase
      .from('rtc_calls')
      .update({
        status: 'active',
        started_at: new Date().toISOString(),
      })
      .eq('id', rtc_call_id);

    if (updateError) {
      throw updateError;
    }

    console.log('✅ Call accepted:', rtc_call_id);

    return new Response(
      JSON.stringify({
        room_url: rtcCall.room_id,
        callee_token: rtcCall.callee_token,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error accepting call:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
