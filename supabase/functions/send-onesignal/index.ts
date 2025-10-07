const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("📥 send-onesignal invoked");
    const body = await req.json();
    console.log("📦 Request body:", JSON.stringify(body, null, 2));
    
    const APP_ID = Deno.env.get('ONESIGNAL_APP_ID');
    const API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY');

    if (!APP_ID || !API_KEY) {
      console.error("❌ OneSignal credentials not configured");
      return new Response(
        JSON.stringify({ ok: false, error: 'OneSignal credentials not configured' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
      );
    }

    const externalUserIds = body.externalUserIds ?? body.userIds ?? [];
    console.log(`📤 Sending to ${externalUserIds.length} users:`, externalUserIds);

    // Build OneSignal notification payload
    const payload = {
      app_id: APP_ID,
      include_external_user_ids: externalUserIds,
      target_channel: 'push',
      headings: body.headings ?? { en: 'New Booking' },
      contents: body.contents ?? { en: 'Tap to view/accept' },
      data: body.data ?? {},
    };

    console.log("🔔 OneSignal payload:", JSON.stringify(payload, null, 2));

    const res = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('❌ OneSignal API error:', err);
      return new Response(
        JSON.stringify({ ok: false, error: err }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
      );
    }

    const json = await res.json();
    console.log('✅ OneSignal notification sent successfully:', JSON.stringify(json, null, 2));
    
    return new Response(
      JSON.stringify({ ok: true, result: json }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
    );
  } catch (e) {
    console.error('❌ Exception in send-onesignal:', e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
    );
  }
});
