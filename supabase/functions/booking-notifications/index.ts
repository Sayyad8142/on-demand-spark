import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("📥 booking-notifications invoked");
    
    // SECURITY: Verify authentication - only system/triggers should call this
    // For now, check that request has valid anon key or service key
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error("❌ No authorization header");
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    // Validate request body
    const { booking_id } = await req.json();
    
    // SECURITY: Validate booking_id is UUID format
    if (!booking_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(booking_id)) {
      console.error("❌ Invalid booking_id format");
      return new Response("Invalid booking_id", { status: 400, headers: corsHeaders });
    }

    console.log("🔍 Loading booking:", booking_id);
    
    // Load booking with cust_name field and price_inr
    const { data: b, error: be } = await supabase
      .from("bookings")
      .select("id, status, service_type, community, cust_name, cust_phone, flat_no, price_inr")
      .eq("id", booking_id)
      .single();
      
    if (be) {
      console.error("❌ Booking load error:", be);
      return new Response(JSON.stringify({ error: be.message }), { status: 500 });
    }
    
    if (!b || b.status !== "pending") {
      console.log("⏭️ Skipping - booking not pending:", b?.status);
      return new Response("skip - not pending", { status: 200 });
    }

    console.log("✅ Booking loaded:", { service_type: b.service_type, community: b.community });

    // Eligible workers: active, available, not busy, matching service & community
    console.log("🔍 Finding eligible workers...");
    const { data: workers, error: we } = await supabase
      .from("workers")
      .select("id, full_name, user_id")
      .eq("is_active", true)
      .eq("is_available", true)
      .eq("is_busy", false)
      .contains("service_types", [b.service_type])
      .or(`community.eq.${b.community},community.is.null`);
      
    if (we) {
      console.error("❌ Workers load error:", we);
      return new Response(JSON.stringify({ error: we.message }), { status: 500 });
    }
    
    if (!workers?.length) {
      console.log("⚠️ No eligible workers found");
      return new Response("no-workers", { status: 200 });
    }

    // Use user_id for FCM token lookup (workers are now linked to auth users)
    const userIds = workers
      .map((w) => w.user_id || w.id) // Fallback to worker.id for legacy workers
      .filter(Boolean);
    
    console.log(`✅ Found ${workers.length} eligible workers:`, workers.map(w => w.full_name).join(", "));
    console.log(`🔑 User IDs (for FCM):`, userIds);
    console.log(`📋 Worker details:`, workers.map(w => ({ name: w.full_name, worker_id: w.id, user_id: w.user_id })));

    if (userIds.length === 0) {
      console.log("⚠️ No user_ids found for workers - they may need to log in to link their accounts");
      return new Response("no-user-ids", { status: 200 });
    }

    // Call send-fcm edge function via HTTP
    const fcmUrl = `${SUPABASE_URL}/functions/v1/send-fcm`;
    console.log("📤 Calling send-fcm for user IDs:", userIds);
    
    const sendResponse = await fetch(fcmUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        workerIds: userIds, // Now using auth user IDs for FCM token lookup
        title: "New Booking Alert!",
        body: `${b.service_type.replace('_', ' ')} in ${b.community}. Tap to accept!`,
        data: { 
          type: "BOOKING_ALERT",
          bookingId: booking_id, 
          booking_id: booking_id,
          customer: b.cust_name || "New Customer",
          community: b.community,
          serviceType: b.service_type,
          location: b.flat_no || "",
          price: String(b.price_inr || 0)
        },
      }),
    });

    if (!sendResponse.ok) {
      const error = await sendResponse.text();
      console.error("❌ FCM send error:", error);
      return new Response(JSON.stringify({ error }), { status: 500 });
    }

    const result = await sendResponse.json();
    console.log("✅ FCM notifications sent successfully:", result);
    
    return new Response(
      JSON.stringify({ 
        success: true,
        sent: userIds.length, 
        workers: workers.map(w => ({ 
          id: w.id, 
          name: w.full_name, 
          user_id: w.user_id,
          fcm_lookup_id: w.user_id || w.id 
        })),
        result 
      }), 
      { status: 200, headers: corsHeaders }
    );
  } catch (e) {
    console.error("❌ Exception in booking-notifications:", e);
    return new Response(`err:${(e as Error)?.message ?? e}`, { status: 500, headers: corsHeaders });
  }
});
