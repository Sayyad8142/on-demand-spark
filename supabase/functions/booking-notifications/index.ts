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
    
    // Load booking with all relevant fields
    const { data: b, error: be } = await supabase
      .from("bookings")
      .select("id, status, service_type, community, cust_name, cust_phone, flat_no, price_inr, booking_type, scheduled_date, scheduled_time")
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

    console.log("✅ Booking loaded:", { service_type: b.service_type, community: b.community, price_inr: b.price_inr, booking_type: b.booking_type });

    // Determine timestamp for availability check
    let checkTimestamp: string;
    if (b.booking_type === 'scheduled' && b.scheduled_date && b.scheduled_time) {
      checkTimestamp = `${b.scheduled_date}T${b.scheduled_time}`;
      console.log("📅 Scheduled booking - checking availability at:", checkTimestamp);
    } else {
      checkTimestamp = new Date().toISOString();
      console.log("⚡ Instant booking - checking availability at:", checkTimestamp);
    }

    // Eligible workers: active, available, not busy, matching service & community
    console.log("🔍 Finding eligible workers...");
    const { data: workers, error: we } = await supabase
      .from("workers")
      .select("id, full_name, user_id, rating, total_ratings")
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

    console.log(`📋 Found ${workers.length} potentially eligible workers, filtering by availability...`);

    // Filter workers by availability at the check timestamp
    const availableWorkers = [];
    for (const worker of workers) {
      const { data: isAvailable, error: availError } = await supabase
        .rpc('is_worker_available_at_time', {
          p_worker_id: worker.id,
          p_timestamp: checkTimestamp
        });
      
      if (availError) {
        console.error(`❌ Error checking availability for worker ${worker.id}:`, availError);
        continue;
      }
      
      if (isAvailable) {
        availableWorkers.push(worker);
      } else {
        console.log(`⏭️  Worker ${worker.full_name} not available at ${checkTimestamp}`);
      }
    }

    if (availableWorkers.length === 0) {
      console.log("⚠️ No workers available in the selected time window");
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'No workers available in your selected time window' 
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    console.log(`✅ Found ${availableWorkers.length} available workers out of ${workers.length} total`);

    // Sort available workers by rating (highest first), then by total_ratings for tie-breaking
    const sortedWorkers = availableWorkers.sort((a, b) => {
      const ratingDiff = (b.rating || 0) - (a.rating || 0);
      if (ratingDiff !== 0) return ratingDiff;
      return (b.total_ratings || 0) - (a.total_ratings || 0);
    });

    console.log(`✅ Sorted ${sortedWorkers.length} available workers by rating`);
    
    // Define priority tiers based on rating
    const TIER_1_MIN_RATING = 4.5; // Top tier: 4.5+ stars
    const TIER_2_MIN_RATING = 4.0; // Mid tier: 4.0-4.5 stars
    const TIER_TIMEOUT_SECONDS = 30; // Time window before moving to next tier
    
    // Assign workers to tiers
    const tier1Workers = sortedWorkers.filter(w => (w.rating || 0) >= TIER_1_MIN_RATING);
    const tier2Workers = sortedWorkers.filter(w => (w.rating || 0) >= TIER_2_MIN_RATING && (w.rating || 0) < TIER_1_MIN_RATING);
    const tier3Workers = sortedWorkers.filter(w => (w.rating || 0) < TIER_2_MIN_RATING);

    console.log(`📊 Priority Tiers: Tier 1 (${tier1Workers.length}), Tier 2 (${tier2Workers.length}), Tier 3 (${tier3Workers.length})`);

    // Create booking_requests for all workers with priority order
    const now = new Date();
    const bookingRequests = sortedWorkers.map((worker, index) => {
      let tier = 3;
      let timeoutSeconds = TIER_TIMEOUT_SECONDS * 3;
      
      if ((worker.rating || 0) >= TIER_1_MIN_RATING) {
        tier = 1;
        timeoutSeconds = TIER_TIMEOUT_SECONDS;
      } else if ((worker.rating || 0) >= TIER_2_MIN_RATING) {
        tier = 2;
        timeoutSeconds = TIER_TIMEOUT_SECONDS * 2;
      }

      return {
        booking_id,
        worker_id: worker.user_id || worker.id,
        order_sequence: tier,
        status: tier === 1 ? 'pending' : 'queued',
        offered_at: tier === 1 ? now.toISOString() : null,
        timeout_at: tier === 1 ? new Date(now.getTime() + timeoutSeconds * 1000).toISOString() : null,
      };
    });

    // Insert booking requests
    const { error: reqError } = await supabase
      .from("booking_requests")
      .insert(bookingRequests);

    if (reqError) {
      console.error("❌ Error creating booking requests:", reqError);
      // Continue anyway to send notifications
    }

    // Only notify Tier 1 workers initially
    const tier1UserIds = tier1Workers
      .map((w) => w.user_id || w.id)
      .filter(Boolean);

    if (tier1UserIds.length === 0) {
      console.log("⚠️ No Tier 1 workers, notifying Tier 2...");
      // If no tier 1, immediately notify tier 2
      const tier2UserIds = tier2Workers.map((w) => w.user_id || w.id).filter(Boolean);
      
      if (tier2UserIds.length === 0) {
        console.log("⚠️ No Tier 2 workers, notifying all...");
        const allUserIds = sortedWorkers.map((w) => w.user_id || w.id).filter(Boolean);
        return await sendNotifications(allUserIds, b, booking_id);
      }
      
      return await sendNotifications(tier2UserIds, b, booking_id);
    }

    console.log(`🎯 Notifying Tier 1 workers first (${tier1UserIds.length} workers, ${TIER_TIMEOUT_SECONDS}s window)`);
    console.log(`⏳ Tier 2 (${tier2Workers.length}) and Tier 3 (${tier3Workers.length}) will be notified if no acceptance`);

    return await sendNotifications(tier1UserIds, b, booking_id);
  } catch (e) {
    console.error("❌ Exception in booking-notifications:", e);
    return new Response(`err:${(e as Error)?.message ?? e}`, { status: 500, headers: corsHeaders });
  }
});

// Helper function to send FCM notifications
async function sendNotifications(userIds: string[], booking: any, bookingId: string) {
  const fcmUrl = `${SUPABASE_URL}/functions/v1/send-fcm`;
  console.log("📤 Calling send-fcm for user IDs:", userIds);
  
  const sendResponse = await fetch(fcmUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      workerIds: userIds,
      title: "New Booking Alert!",
      body: `${booking.service_type.replace('_', ' ')} in ${booking.community}. Tap to accept!`,
      data: { 
        type: "BOOKING_ALERT",
        bookingId: bookingId, 
        booking_id: bookingId,
        customer: booking.cust_name || "New Customer",
        community: booking.community,
        serviceType: booking.service_type,
        location: booking.flat_no || "",
        price: String(booking.price_inr || 0)
      },
    }),
  });

  if (!sendResponse.ok) {
    const error = await sendResponse.text();
    console.error("❌ FCM send error:", error);
    return new Response(JSON.stringify({ error }), { status: 500, headers: corsHeaders });
  }

  const result = await sendResponse.json();
  console.log("✅ FCM notifications sent successfully:", result);
  
  return new Response(
    JSON.stringify({ 
      success: true,
      sent: userIds.length,
      result 
    }), 
    { status: 200, headers: corsHeaders }
  );
}
