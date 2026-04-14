import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://paywwbuqycovjopryele.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeWorkerTargetId = (worker: { id: string; user_id?: string | null }): string => {
  const u = worker.user_id;
  if (typeof u === 'string' && uuidRegex.test(u)) return u;
  return worker.id;
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

// Supported service types (cook removed)
const SUPPORTED_SERVICES = ['maid', 'bathroom_cleaning'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("📥 booking-notifications invoked");
    console.log("═══════════════════════════════════════════════════════════");
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error("❌ No authorization header");
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const { booking_id } = await req.json();
    
    if (!booking_id || !uuidRegex.test(booking_id)) {
      console.error("❌ Invalid booking_id format");
      return new Response("Invalid booking_id", { status: 400, headers: corsHeaders });
    }

    console.log("🔍 Loading booking:", booking_id);
    
    const { data: b, error: be } = await supabase
      .from("bookings")
      .select("id, status, service_type, community, cust_name, cust_phone, flat_no, price_inr, scheduled_date, scheduled_time, booking_type")
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

    // VALIDATION: Reject unsupported services
    if (!SUPPORTED_SERVICES.includes(b.service_type)) {
      console.error(`❌ Unsupported service type: ${b.service_type}`);
      return new Response(
        JSON.stringify({ error: "Service not supported", service_type: b.service_type }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isScheduled = !!(b.scheduled_date && b.scheduled_time);
    const bookingType = isScheduled ? "scheduled" : "instant";
    
    console.log(`✅ Booking loaded (${bookingType}):`, { 
      service_type: b.service_type, 
      community: b.community,
      scheduled_date: b.scheduled_date,
      scheduled_time: b.scheduled_time,
      price_inr: b.price_inr,
    });

    // Fetch community details
    const { data: communityData, error: communityError } = await supabase
      .from("communities")
      .select("id, name, center_lat, center_lng, radius_m")
      .ilike("name", b.community.replace(/-/g, ' '))
      .single();

    if (communityError) {
      console.error("❌ Community not found:", b.community);
      return new Response(
        JSON.stringify({ error: `Community "${b.community}" not found.` }), 
        { status: 400, headers: corsHeaders }
      );
    }

    console.log("✅ Community found:", { id: communityData.id, name: communityData.name });

    const hasCommunityCenter = communityData?.center_lat && communityData?.center_lng;

    // Determine check time for availability
    let checkTimeString: string;
    let checkDayOfWeek: number;
    
    if (b.scheduled_date && b.scheduled_time) {
      checkTimeString = b.scheduled_time;
      const [year, month, day] = b.scheduled_date.split('-').map(Number);
      const scheduledDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      const jsDay = scheduledDate.getUTCDay();
      const dayMapping: Record<number, number> = { 0: 6, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };
      checkDayOfWeek = dayMapping[jsDay];
      console.log(`📅 Scheduled booking — checking availability for: ${b.scheduled_date} ${b.scheduled_time} (IST), day: ${checkDayOfWeek}`);
    } else {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
      checkTimeString = formatter.format(now);
      const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' });
      const weekday = dayFormatter.format(now);
      const weekdayMap: Record<string, number> = { 'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5, 'Sun': 6 };
      checkDayOfWeek = weekdayMap[weekday];
      console.log(`📅 Instant booking — current IST time: ${checkTimeString}`);
    }

    // Get workers with matching availability slots
    const { data: availableWorkers, error: availError } = await supabase
      .from('worker_availability')
      .select('worker_id, slots')
      .eq('day_of_week', checkDayOfWeek);

    if (availError) {
      console.error('❌ Error fetching availability:', availError);
      return new Response(JSON.stringify({ error: 'Failed to fetch availability' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const availableWorkerIds = new Set<string>();
    if (availableWorkers) {
      availableWorkers.forEach((worker) => {
        if (worker.slots && Array.isArray(worker.slots)) {
          const isAvailableAtTime = worker.slots.some((slotStart: string) => {
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

    console.log(`📊 Workers with availability at ${checkTimeString}: ${availableWorkerIds.size}`);

    // Query eligible workers
    let workersQuery = supabase
      .from("workers")
      .select("id, full_name, user_id, rating, total_ratings, selected_community_id, location_enabled, in_geofence, last_seen_at, last_lat, last_lng, fcm_token")
      .eq("is_active", true)
      .eq("is_available", true)
      .eq("is_busy", false)
      .neq("is_blocked", true)
      .contains("service_types", [b.service_type]);
    
    if (communityData?.id) {
      workersQuery = workersQuery.eq("selected_community_id", communityData.id);
      console.log("🔍 Filtering by selected_community_id:", communityData.id);
    }

    if (availableWorkerIds.size > 0) {
      const availableIds = Array.from(availableWorkerIds);
      workersQuery = workersQuery.in("id", availableIds);
    } else {
      console.log("⚠️ No workers have availability for this time slot");
      return new Response(
        JSON.stringify({ message: 'No workers available for this time slot', booking_id }), 
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { data: workers, error: we } = await workersQuery;
      
    if (we) {
      console.error("❌ Workers load error:", we);
      return new Response(JSON.stringify({ error: we.message }), { status: 500 });
    }
    
    if (!workers?.length) {
      console.log("⚠️ No eligible workers found after all filters");
      return new Response("no-workers", { status: 200 });
    }

    // Log each eligible worker with token status
    console.log(`📊 ${workers.length} eligible workers:`);
    for (const w of workers) {
      const hasToken = !!w.fcm_token;
      console.log(`  ${w.full_name} (${w.id}): rating=${w.rating}, fcm_token=${hasToken ? "YES" : "NO"}, community=${w.selected_community_id}`);
    }

    // Sort workers by rating (highest first), then distance
    const sortedWorkers = workers.sort((a, b) => {
      const ratingDiff = (b.rating || 0) - (a.rating || 0);
      if (ratingDiff !== 0) return ratingDiff;
      if (hasCommunityCenter && a.last_lat && a.last_lng && b.last_lat && b.last_lng) {
        const distA = haversineM(a.last_lat, a.last_lng, communityData.center_lat, communityData.center_lng);
        const distB = haversineM(b.last_lat, b.last_lng, communityData.center_lat, communityData.center_lng);
        return distA - distB;
      }
      return (b.total_ratings || 0) - (a.total_ratings || 0);
    });

    // Standard rating-based tiers
    const TIER_TIMEOUT_SECONDS = 30;
    const TIER_1_MIN_RATING = 4.5;
    const TIER_2_MIN_RATING = 4.0;
    
    const tier1Workers = sortedWorkers.filter(w => (w.rating || 0) >= TIER_1_MIN_RATING);
    const tier2Workers = sortedWorkers.filter(w => (w.rating || 0) >= TIER_2_MIN_RATING && (w.rating || 0) < TIER_1_MIN_RATING);
    const tier3Workers = sortedWorkers.filter(w => (w.rating || 0) < TIER_2_MIN_RATING);

    console.log(`📊 Tiers: T1(${tier1Workers.length}), T2(${tier2Workers.length}), T3(${tier3Workers.length})`);

    // Create booking_requests
    const currentTime = new Date();
    const bookingRequests = sortedWorkers.map((worker) => {
      let tier = 3;
      let timeoutSeconds = TIER_TIMEOUT_SECONDS * 3;

      if ((worker.rating || 0) >= TIER_1_MIN_RATING) {
        tier = 1;
        timeoutSeconds = TIER_TIMEOUT_SECONDS;
      } else if ((worker.rating || 0) >= TIER_2_MIN_RATING) {
        tier = 2;
        timeoutSeconds = TIER_TIMEOUT_SECONDS * 2;
      }

      const timeoutAt = new Date(currentTime.getTime() + timeoutSeconds * 1000).toISOString();

      return {
        booking_id,
        worker_id: worker.id,
        order_sequence: tier,
        status: 'pending',
        offered_at: tier === 1 ? currentTime.toISOString() : null,
        timeout_at: timeoutAt,
      };
    });

    const { error: reqError } = await supabase
      .from("booking_requests")
      .insert(bookingRequests);

    if (reqError) {
      console.error("❌ Error creating booking requests:", reqError);
    } else {
      console.log(`✅ Created ${bookingRequests.length} booking_requests`);
    }

    // Notify Tier 1 first, fall back to Tier 2, then all
    const tier1UserIds = tier1Workers
      .map((w) => normalizeWorkerTargetId(w))
      .filter((id) => uuidRegex.test(id));

    if (tier1UserIds.length === 0) {
      console.log("⚠️ No Tier 1 workers, trying Tier 2...");
      const tier2UserIds = tier2Workers
        .map((w) => normalizeWorkerTargetId(w))
        .filter((id) => uuidRegex.test(id));

      if (tier2UserIds.length === 0) {
        console.log("⚠️ No Tier 2 workers, notifying ALL...");
        const allUserIds = sortedWorkers
          .map((w) => normalizeWorkerTargetId(w))
          .filter((id) => uuidRegex.test(id));
        return await sendNotifications(allUserIds, b, booking_id, bookingType);
      }

      return await sendNotifications(tier2UserIds, b, booking_id, bookingType);
    }

    console.log(`🎯 Notifying Tier 1: ${tier1UserIds.length} workers`);
    return await sendNotifications(tier1UserIds, b, booking_id, bookingType);
  } catch (e) {
    console.error("❌ Exception:", e);
    return new Response(`err:${(e as Error)?.message ?? e}`, { status: 500, headers: corsHeaders });
  }
});

// Helper function to send FCM notifications via send-fcm edge function
async function sendNotifications(userIds: string[], booking: any, bookingId: string, bookingType: string) {
  const fcmUrl = `${SUPABASE_URL}/functions/v1/send-fcm`;
  console.log(`📤 Calling send-fcm for ${bookingType} booking ${bookingId}`);
  console.log(`   Target worker IDs: [${userIds.join(", ")}]`);
  
  let scheduledTimeDisplay = "";
  if (booking.scheduled_date && booking.scheduled_time) {
    const dateObj = new Date(`${booking.scheduled_date}T${booking.scheduled_time}`);
    scheduledTimeDisplay = dateObj.toLocaleString('en-IN', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      hour12: true, timeZone: 'Asia/Kolkata'
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
      booking_type: bookingType,
      customer: booking.cust_name || "New Customer",
      community: booking.community || '',
      serviceType: booking.service_type,
      service_type: booking.service_type,
      location: "",
      flat_no: booking.flat_no || "",
      price: String(booking.price_inr || 0),
      scheduled_time: scheduledTimeDisplay,
      scheduled_date: booking.scheduled_date || "",
      scheduled_time_raw: booking.scheduled_time || ""
    },
  };
  
  const sendResponse = await fetch(fcmUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(fcmPayload),
  });

  const responseText = await sendResponse.text();
  
  if (!sendResponse.ok) {
    console.error(`❌ send-fcm returned ${sendResponse.status}: ${responseText}`);
    return new Response(JSON.stringify({ error: responseText }), { status: 500, headers: corsHeaders });
  }

  let result;
  try {
    result = JSON.parse(responseText);
  } catch {
    result = { raw: responseText };
  }
  
  // Log FCM result summary
  console.log(`📊 send-fcm result for booking ${bookingId}:`);
  console.log(`   firebase_project: ${result.firebase_project || "unknown"}`);
  console.log(`   sent: ${result.sent || 0}, failed: ${result.failed || 0}`);
  
  if (result.results) {
    for (const r of result.results) {
      if (r.success) {
        console.log(`   ✅ ${r.worker_name} (${r.user_id})`);
      } else {
        console.error(`   ❌ ${r.worker_name} (${r.user_id}): ${r.error_code || r.error}`);
      }
    }
  }

  return new Response(
    JSON.stringify({ success: true, booking_type: bookingType, booking_id: bookingId, sent: userIds.length, result }), 
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
