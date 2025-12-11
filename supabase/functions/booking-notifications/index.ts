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
    
    // Load booking details including cuisine_preference for cook bookings
    const { data: b, error: be } = await supabase
      .from("bookings")
      .select("id, status, service_type, community, cust_name, cust_phone, flat_no, price_inr, scheduled_date, scheduled_time, booking_type, cook_cuisine_pref")
      .eq("id", booking_id)
      .single();
      
    if (be) {
      console.error("❌ Booking load error:", be);
      return new Response(JSON.stringify({ error: be.message }), { status: 500, headers: corsHeaders });
    }
    
    if (!b || b.status !== "pending") {
      console.log("⏭️ Skipping - booking not pending:", b?.status);
      return new Response("skip - not pending", { status: 200, headers: corsHeaders });
    }

    // Determine if this is a scheduled or instant booking
    const isScheduled = !!(b.scheduled_date && b.scheduled_time);
    const bookingType = isScheduled ? "scheduled" : "instant";
    
    // Log cuisine preference for cook bookings
    const isCookBooking = b.service_type === 'cook';
    const cuisinePreference = b.cook_cuisine_pref || 'any';
    
    console.log(`✅ Booking loaded (${bookingType}):`, { 
      service_type: b.service_type, 
      community: b.community,
      scheduled_date: b.scheduled_date,
      scheduled_time: b.scheduled_time,
      ...(isCookBooking && { cuisine_preference: cuisinePreference })
    });

    // Fetch community details by name (case-insensitive)
    const { data: communityData, error: communityError } = await supabase
      .from("communities")
      .select("id, name, center_lat, center_lng, radius_m")
      .ilike("name", b.community.replace(/-/g, ' '))
      .single();

    if (communityError) {
      console.error("❌ Community not found in communities table:", b.community);
      return new Response(
        JSON.stringify({ error: `Community "${b.community}" not found. Please configure it first.` }), 
        { status: 400, headers: corsHeaders }
      );
    }

    console.log("✅ Community found:", {
      name: communityData.name,
      has_center: !!(communityData.center_lat && communityData.center_lng)
    });

    // Check if community has geofence configured (optional - only used for distance-based sorting)
    const hasCommunityCenter = communityData?.center_lat && communityData?.center_lng;
    
    if (!hasCommunityCenter) {
      console.log("⚠️ Community has no geofence configured (notifications will still be sent):", communityData.name);
    }

  // Determine which time to check - scheduled time or current time
  let checkTimeString: string;
  let checkDayOfWeek: number;
  
  if (b.scheduled_date && b.scheduled_time) {
    // For scheduled bookings, use the stored time DIRECTLY (it's already in IST)
    // Don't convert through Date object which causes timezone issues
    checkTimeString = b.scheduled_time; // Already in HH:mm:ss IST format
    
    // Parse the date to get day of week (create date at midnight UTC to avoid timezone shifts)
    const [year, month, day] = b.scheduled_date.split('-').map(Number);
    const scheduledDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)); // Use noon UTC to avoid date boundary issues
    const jsDay = scheduledDate.getUTCDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    
    // Convert JS day (Sun=0) to our format (Mon=0, Sun=6)
    const dayMapping: Record<number, number> = {
      0: 6, // Sunday
      1: 0, // Monday
      2: 1, // Tuesday
      3: 2, // Wednesday
      4: 3, // Thursday
      5: 4, // Friday
      6: 5  // Saturday
    };
    checkDayOfWeek = dayMapping[jsDay];
    
    console.log(`📅 Scheduled booking - checking availability for: ${b.scheduled_date} ${b.scheduled_time} (IST)`);
    console.log(`📅 Using time directly: ${checkTimeString}, day: ${checkDayOfWeek}`);
  } else {
    // For instant bookings, check current time in IST
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    checkTimeString = formatter.format(now);
    
    // Get day of week in IST
    const dayFormatter = new Intl.DateTimeFormat('en-US', { 
      timeZone: 'Asia/Kolkata',
      weekday: 'short'
    });
    const weekday = dayFormatter.format(now);
    
    // Map weekday names to our database day numbering (Monday=0, Sunday=6)
    const weekdayMap: Record<string, number> = {
      'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5, 'Sun': 6
    };
    checkDayOfWeek = weekdayMap[weekday];
    
    console.log(`📅 Instant booking - checking availability for current time in IST`);
  }

  console.log(`📅 Checking availability for: ${checkTimeString} on day ${checkDayOfWeek} (Mon=0...Sun=6)`);

  // Get workers with availability for the check time
  const { data: availableWorkers, error: availError } = await supabase
    .from('worker_availability')
    .select('worker_id, slots')
    .eq('day_of_week', checkDayOfWeek);

  if (availError) {
    console.error('Error fetching availability:', availError);
    return new Response(JSON.stringify({ error: 'Failed to fetch availability' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Filter workers whose check time falls within their selected slots
  const availableWorkerIds = new Set<string>();
  if (availableWorkers) {
    availableWorkers.forEach((worker) => {
      if (worker.slots && Array.isArray(worker.slots)) {
        // Check if check time falls within any of the worker's slots
        const isAvailableAtTime = worker.slots.some((slotStart: string) => {
          // Each slot is 30 minutes, so calculate the end time
          const [hours, minutes] = slotStart.split(':').map(Number);
          const endMinutes = minutes + 30;
          const endHours = endMinutes >= 60 ? hours + 1 : hours;
          const normalizedEndMinutes = endMinutes >= 60 ? endMinutes - 60 : endMinutes;
          const slotEnd = `${endHours.toString().padStart(2, '0')}:${normalizedEndMinutes.toString().padStart(2, '0')}:00`;
          return checkTimeString >= slotStart && checkTimeString < slotEnd;
        });
        if (isAvailableAtTime) {
          availableWorkerIds.add(worker.worker_id);
        }
      }
    });
  }

  console.log(`Found ${availableWorkerIds.size} workers available at ${checkTimeString} on day ${checkDayOfWeek}`);

  // Query for eligible workers based on service type, community, and availability
  // For cook bookings, also fetch cook_cuisine_tags for cuisine matching
  let workersQuery = supabase
    .from("workers")
    .select("id, full_name, user_id, rating, total_ratings, selected_community_id, location_enabled, in_geofence, last_seen_at, last_lat, last_lng, cook_cuisine_tags")
    .eq("is_active", true)
    .eq("is_available", true)
    .eq("is_busy", false)
    .contains("service_types", [b.service_type]);
  
  // Only filter by community if we have the community ID
  if (communityData?.id) {
    workersQuery = workersQuery.eq("selected_community_id", communityData.id);
    console.log("🔍 Filtering workers by selected_community_id:", communityData.id);
  } else {
    console.log("⚠️ No community ID, finding all workers with matching service type");
  }

  // Add availability filter - only include workers in the available set
  if (availableWorkerIds.size > 0) {
    workersQuery = workersQuery.in("id", Array.from(availableWorkerIds));
    console.log(`🔍 Filtering by ${availableWorkerIds.size} workers with matching availability`);
  } else {
    console.log("⚠️ No workers have availability set for current time slot - no notifications will be sent");
    return new Response(
      JSON.stringify({ 
        message: 'No workers available for this time slot',
        booking_id: booking_id
      }), 
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  const { data: workers, error: we } = await workersQuery;
      
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

    // =====================================================
    // CUISINE-AWARE MATCHING FOR COOK BOOKINGS
    // =====================================================
    let eligibleWorkers = workers;

    if (isCookBooking && cuisinePreference !== 'any') {
      console.log(`🍳 Cook booking with cuisine preference: ${cuisinePreference}`);
      
      // Split workers into primary (matching cuisine) and secondary (fallback)
      const primaryWorkers: typeof workers = [];
      const secondaryWorkers: typeof workers = [];
      
      workers.forEach((worker) => {
        const cuisineTags: string[] = worker.cook_cuisine_tags || [];
        
        // Check if worker's cuisine tags include the requested cuisine
        const matchesCuisine = cuisineTags.includes(cuisinePreference);
        
        if (matchesCuisine) {
          primaryWorkers.push(worker);
        } else {
          secondaryWorkers.push(worker);
        }
      });
      
      console.log(`🍳 Cuisine matching results:`);
      console.log(`   - PRIMARY (${cuisinePreference} cooks): ${primaryWorkers.length} workers`);
      console.log(`   - SECONDARY (other cooks): ${secondaryWorkers.length} workers`);
      
      if (primaryWorkers.length > 0) {
        primaryWorkers.forEach((w, i) => {
          console.log(`   [Primary ${i+1}] ${w.full_name} - cuisine_tags: ${JSON.stringify(w.cook_cuisine_tags)}, rating: ${w.rating}`);
        });
      }
      
      if (secondaryWorkers.length > 0) {
        secondaryWorkers.forEach((w, i) => {
          console.log(`   [Secondary ${i+1}] ${w.full_name} - cuisine_tags: ${JSON.stringify(w.cook_cuisine_tags)}, rating: ${w.rating}`);
        });
      }
      
      // Merge: primary workers first, then secondary as fallback
      // This ensures primary workers get Tier 1 priority
      eligibleWorkers = [...primaryWorkers, ...secondaryWorkers];
      
      if (primaryWorkers.length === 0) {
        console.log(`⚠️ No primary ${cuisinePreference} cooks found, falling back to all cooks`);
      }
    } else if (isCookBooking) {
      console.log(`🍳 Cook booking with cuisine_preference='any' - all cook workers eligible`);
    }

    console.log(`📊 Total eligible workers after cuisine filtering: ${eligibleWorkers.length}`);

    if (!eligibleWorkers.length) {
      console.log("⚠️ No workers available");
      return new Response("No experts available", { status: 200 });
    }

    // Sort workers by rating (highest first), then distance to center (if available)
    // NOTE: For cook bookings with cuisine preference, we preserve primary/secondary ordering
    // by only sorting within each group
    let sortedWorkers: typeof eligibleWorkers;
    
    if (isCookBooking && cuisinePreference !== 'any') {
      // For cuisine-aware matching, sort within primary and secondary groups separately
      // to maintain the primary-first ordering
      const primaryCount = eligibleWorkers.filter(w => 
        (w.cook_cuisine_tags || []).includes(cuisinePreference)
      ).length;
      
      const primaryWorkers = eligibleWorkers.slice(0, primaryCount);
      const secondaryWorkers = eligibleWorkers.slice(primaryCount);
      
      // Sort each group by rating
      const sortByRating = (a: typeof workers[0], b: typeof workers[0]) => {
        const ratingDiff = (b.rating || 0) - (a.rating || 0);
        if (ratingDiff !== 0) return ratingDiff;
        if (hasCommunityCenter && a.last_lat && a.last_lng && b.last_lat && b.last_lng) {
          const distA = haversineM(a.last_lat, a.last_lng, communityData.center_lat, communityData.center_lng);
          const distB = haversineM(b.last_lat, b.last_lng, communityData.center_lat, communityData.center_lng);
          return distA - distB;
        }
        return (b.total_ratings || 0) - (a.total_ratings || 0);
      };
      
      primaryWorkers.sort(sortByRating);
      secondaryWorkers.sort(sortByRating);
      
      sortedWorkers = [...primaryWorkers, ...secondaryWorkers];
      
      console.log(`🍳 Final cook worker order (cuisine-aware):`);
      sortedWorkers.forEach((w, i) => {
        const isPrimary = (w.cook_cuisine_tags || []).includes(cuisinePreference);
        console.log(`   [${i+1}] ${w.full_name} (${isPrimary ? 'PRIMARY' : 'SECONDARY'}) - rating: ${w.rating}, tags: ${JSON.stringify(w.cook_cuisine_tags)}`);
      });
    } else {
      // For non-cook bookings or cuisine_preference='any', use standard sorting
      sortedWorkers = eligibleWorkers.sort((a, b) => {
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
    }

    console.log(`✅ Final sorted count: ${sortedWorkers.length} workers`);
    console.log(`📊 Filter summary: ${totalAvailable} total → ${eligibleWorkers.length} after cuisine filtering → ${sortedWorkers.length} final`);
    
    // =====================================================
    // TIERING LOGIC
    // For cook bookings with cuisine preference:
    //   - Tier 1 = PRIMARY workers (matching cuisine) sorted by rating
    //   - Tier 2 = SECONDARY workers (other cooks) sorted by rating
    // For other bookings:
    //   - Use rating-based tiers as before
    // =====================================================
    const TIER_TIMEOUT_SECONDS = 30; // Time window before moving to next tier
    
    let tier1Workers: typeof sortedWorkers;
    let tier2Workers: typeof sortedWorkers;
    let tier3Workers: typeof sortedWorkers;
    
    if (isCookBooking && cuisinePreference !== 'any') {
      // For cuisine-aware cook bookings: Tier 1 = primary, Tier 2 = secondary
      tier1Workers = sortedWorkers.filter(w => 
        (w.cook_cuisine_tags || []).includes(cuisinePreference)
      );
      tier2Workers = sortedWorkers.filter(w => 
        !(w.cook_cuisine_tags || []).includes(cuisinePreference)
      );
      tier3Workers = []; // No tier 3 for cuisine-aware matching
      
      console.log(`🍳 Cook booking tiers (cuisine-aware):`);
      console.log(`   - Tier 1 (PRIMARY ${cuisinePreference} cooks): ${tier1Workers.length}`);
      console.log(`   - Tier 2 (SECONDARY other cooks): ${tier2Workers.length}`);
    } else {
      // Standard rating-based tiers for non-cook bookings
      const TIER_1_MIN_RATING = 4.5;
      const TIER_2_MIN_RATING = 4.0;
      
      tier1Workers = sortedWorkers.filter(w => (w.rating || 0) >= TIER_1_MIN_RATING);
      tier2Workers = sortedWorkers.filter(w => (w.rating || 0) >= TIER_2_MIN_RATING && (w.rating || 0) < TIER_1_MIN_RATING);
      tier3Workers = sortedWorkers.filter(w => (w.rating || 0) < TIER_2_MIN_RATING);

      console.log(`📊 Priority Tiers (rating-based): Tier 1 (${tier1Workers.length}), Tier 2 (${tier2Workers.length}), Tier 3 (${tier3Workers.length})`);
    }

    // Create booking_requests for all workers with priority order
    const currentTime = new Date();
    const bookingRequests = sortedWorkers.map((worker) => {
      let tier = 3;
      let timeoutSeconds = TIER_TIMEOUT_SECONDS * 3;
      
      if (isCookBooking && cuisinePreference !== 'any') {
        // Cuisine-aware tiering
        const isPrimary = (worker.cook_cuisine_tags || []).includes(cuisinePreference);
        if (isPrimary) {
          tier = 1;
          timeoutSeconds = TIER_TIMEOUT_SECONDS;
        } else {
          tier = 2;
          timeoutSeconds = TIER_TIMEOUT_SECONDS * 2;
        }
      } else {
        // Rating-based tiering
        const TIER_1_MIN_RATING = 4.5;
        const TIER_2_MIN_RATING = 4.0;
        
        if ((worker.rating || 0) >= TIER_1_MIN_RATING) {
          tier = 1;
          timeoutSeconds = TIER_TIMEOUT_SECONDS;
        } else if ((worker.rating || 0) >= TIER_2_MIN_RATING) {
          tier = 2;
          timeoutSeconds = TIER_TIMEOUT_SECONDS * 2;
        }
      }

      return {
        booking_id,
        worker_id: worker.user_id || worker.id,
        order_sequence: tier,
        status: 'pending',
        offered_at: tier === 1 ? currentTime.toISOString() : null,
        timeout_at: tier === 1 ? new Date(currentTime.getTime() + timeoutSeconds * 1000).toISOString() : null,
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
        return await sendNotifications(allUserIds, b, booking_id, bookingType);
      }
      
      return await sendNotifications(tier2UserIds, b, booking_id, bookingType);
    }

    console.log(`🎯 Notifying Tier 1 workers first (${tier1UserIds.length} workers, ${TIER_TIMEOUT_SECONDS}s window)`);
    console.log(`⏳ Tier 2 (${tier2Workers.length}) and Tier 3 (${tier3Workers.length}) will be notified if no acceptance`);

    return await sendNotifications(tier1UserIds, b, booking_id, bookingType);
  } catch (e) {
    console.error("❌ Exception in booking-notifications:", e);
    return new Response(`err:${(e as Error)?.message ?? e}`, { status: 500, headers: corsHeaders });
  }
});

// Helper function to send FCM notifications
async function sendNotifications(userIds: string[], booking: any, bookingId: string, bookingType: string) {
  const fcmUrl = `${SUPABASE_URL}/functions/v1/send-fcm`;
  console.log(`📤 Calling send-fcm for ${bookingType} booking, user IDs:`, userIds);
  
  // Format scheduled time for display (if scheduled booking)
  let scheduledTimeDisplay = "";
  if (booking.scheduled_date && booking.scheduled_time) {
    // Format: "Dec 5, 7:00 AM"
    const dateObj = new Date(`${booking.scheduled_date}T${booking.scheduled_time}`);
    scheduledTimeDisplay = dateObj.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata'
    });
  }
  
  const fcmPayload = {
    workerIds: userIds,
    title: "New Booking",
    body: "New Booking",
    data: { 
      type: "BOOKING_ALERT",
      bookingId: bookingId, 
      booking_id: bookingId,
      booking_type: bookingType, // "instant" or "scheduled"
      customer: booking.cust_name || "New Customer",
      community: booking.community || '',
      serviceType: booking.service_type,
      service_type: booking.service_type,
      location: "", // Removed flat_no for privacy - only show in overlay
      flat_no: booking.flat_no || "", // Keep flat_no for overlay to read
      price: String(booking.price_inr || 0),
      scheduled_time: scheduledTimeDisplay, // Human-readable scheduled time
      scheduled_date: booking.scheduled_date || "",
      scheduled_time_raw: booking.scheduled_time || ""
    },
  };
  
  console.log(`📦 FCM payload being sent:`, JSON.stringify(fcmPayload, null, 2));
  
  const sendResponse = await fetch(fcmUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(fcmPayload),
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
      booking_type: bookingType,
      sent: userIds.length,
      result 
    }), 
    { status: 200, headers: corsHeaders }
  );
}