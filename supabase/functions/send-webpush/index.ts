import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { workerIds, title, body, url } = await req.json();
    
    console.log('📨 Sending web push to workers:', workerIds);
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "https://paywwbuqycovjopryele.supabase.co",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Set VAPID details for web-push (read from Supabase secrets)
    const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
    
    webpush.setVapidDetails(
      "mailto:support@didisnow.com",
      VAPID_PUBLIC,
      VAPID_PRIVATE
    );

    // Get all subscriptions for the specified workers
    const { data: subs, error } = await supabase
      .from("web_push_subscriptions")
      .select("*")
      .in("user_id", workerIds);

    if (error) {
      console.error('❌ Error fetching subscriptions:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }), 
        { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${subs?.length || 0} subscriptions`);

    const payload = JSON.stringify({ title, body, url });
    const results: any[] = [];

    for (const s of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } } as any,
          payload
        );
        console.log('✅ Sent notification to:', s.endpoint.substring(0, 50));
        results.push({ endpoint: s.endpoint, ok: true });
      } catch (e) {
        console.error('❌ Failed to send notification:', e);
        results.push({ endpoint: s.endpoint, ok: false, error: String(e) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }), 
      { headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error in send-webpush:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }), 
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } }
    );
  }
});
