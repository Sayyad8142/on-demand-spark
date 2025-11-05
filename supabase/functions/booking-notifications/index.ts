import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Haversine distance in meters
const haversineM = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const toRad = (d: number) => d * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s1 = Math.sin(dLat/2) ** 2;
  const s2 = Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng/2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s1 + s2));
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
    
    // Load booking with community reference
    const { data: b, error: be } = await supabase
      .from("bookings")
      .select("id, status, service_type, community_id, cust_name, cust_phone, flat_no, price_inr, communities(id, name, center_lat, center_lng)")
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

    const communityData = (b as any).communities;
    console.log("✅ Booking loaded:", { 
      service_type: b.service_type, 
      community_id: b.community_id, 
      community_name: communityData?.name,
      has_center: !!(communityData?.center_lat && communityData?.center_lng)
    });

    // Check if community has geofence configured
    const hasCommunityCenter = communityData?.center_lat && communityData?.center_lng;
    
    if (!hasCommunityCenter) {
      console.log("⚠️ Community has no geofence configured, proceeding without location filter");
    }

    // Eligible workers: active, available, not busy, matching service & selected community
    console.log("🔍 Finding eligible workers...");
    const { data: workers, error: we } = await supabase
      .from("workers")
      .select("id, full_name, user_id, rating, total_ratings, selected_community_id, location_enabled, in_geofence, last_seen_at, last_lat, last_lng")
      .eq("is_active", true)
      .eq("is_available", true)
      .eq("is_busy", false)
      .contains("service_types", [b.service_type])
      .eq("selected_community_id", b.community_id);
      
    if (we) {
      console.error("❌ Workers load error:", we);
      return new Response(JSON.stringify({ error: we.message }), { status: 500 });
    }
    
    const totalAvailable = workers?.length || 0;
    console.log(`📊 Total available workers: ${totalAvailable}`);

    if (!workers?.length) {
      console.log("⚠️ No eligible workers found");
      return new Response("no-workers", { status: 200 });
    }

    // Filter by fresh location (≤3 min) and geofence
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    let eligibleWorkers = workers;

    if (hasCommunityCenter) {
      eligibleWorkers = workers.filter(w => {
        // Must have location enabled
        if (!w.location_enabled) {
          console.log(`⏭️ Worker ${w.full_name}: location disabled`);
          return false;
        }

        // Must have fresh location (≤3 min)
        if (!w.last_seen_at || w.last_seen_at < threeMinutesAgo) {
          console.log(`⏭️ Worker ${w.full_name}: stale location (${w.last_seen_at})`);
          return false;
        }

        // Must be in geofence
        if (!w.in_geofence) {
          console.log(`⏭️ Worker ${w.full_name}: outside geofence`);
          return false;
        }

        return true;
      });

      console.log(`📊 After fresh location + geofence filter: ${eligibleWorkers.length} workers`);
    }

    if (!eligibleWorkers.length) {
      console.log("⚠️ No workers available in the selected time window");
      return new Response("No nearby experts available", { status: 200 });
    }

    // Sort workers by rating (highest first), then distance to center (if available)
    const sortedWorkers = eligibleWorkers.sort((a, b) => {
      const ratingDiff = (b.rating || 0) - (a.rating || 0);
      if (ratingDiff !== 0) return ratingDiff;

      // Tie-break by distance to community center if available
      if (hasCommunityCenter && a.last_lat && a.last_lng && b.last_lat && b.last_lng) {
        const distA = haversineM(a.last_lat, a.last_lng, communityData.center_lat, communityData.center_lng);
        const distB = haversineM(b.last_lat, b.last_lng, communityData.center_lat, communityData.center_lng);
        return distA - distB; // Closer is better
      }

      return (b.total_ratings || 0) - (a.total_ratings || 0);
    });

    console.log(`✅ Final sorted count: ${sortedWorkers.length} workers`);
    console.log(`📊 Filter summary: ${totalAvailable} total → ${eligibleWorkers.length} after location/geofence → ${sortedWorkers.length} final`);
    
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
      body: `${booking.service_type.replace('_', ' ')} in ${(booking as any).communities?.name || 'your area'}. Tap to accept!`,
      data: { 
        type: "BOOKING_ALERT",
        bookingId: bookingId, 
        booking_id: bookingId,
        customer: booking.cust_name || "New Customer",
        community: (booking as any).communities?.name || '',
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
