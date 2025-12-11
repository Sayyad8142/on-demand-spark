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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { booking_id, tier } = await req.json();
    
    console.log(`📢 Notifying tier ${tier} workers for booking ${booking_id}`);

    // Get booking data
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, service_type, community, cust_name, flat_no, price_inr, status")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      console.error("❌ Booking not found:", bookingError);
      return new Response("booking-not-found", { status: 404, headers: corsHeaders });
    }

    if (booking.status !== "pending") {
      console.log("⏭️ Booking already accepted, skipping notification");
      return new Response("booking-accepted", { status: 200, headers: corsHeaders });
    }

    // Get workers for this tier
    const { data: requests, error: requestsError } = await supabase
      .from("booking_requests")
      .select("worker_id")
      .eq("booking_id", booking_id)
      .eq("order_sequence", tier)
      .eq("status", "pending");

    if (requestsError || !requests?.length) {
      console.log("⚠️ No workers found for tier", tier);
      return new Response("no-workers", { status: 200, headers: corsHeaders });
    }

    const workerIds = requests.map(r => r.worker_id);
    console.log(`🎯 Sending notifications to ${workerIds.length} tier ${tier} workers`);

    // Send FCM notifications
    const fcmUrl = `${SUPABASE_URL}/functions/v1/send-fcm`;
    const sendResponse = await fetch(fcmUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        workerIds,
        title: "New Booking",
        body: "New Booking",
        data: {
          type: "BOOKING_ALERT",
          bookingId: booking_id,
          booking_id: booking_id,
          customer: booking.cust_name || "New Customer",
          community: booking.community,
          serviceType: booking.service_type,
          service_type: booking.service_type,
          location: "", // Removed flat_no for privacy - only show in overlay
          flat_no: booking.flat_no || "", // Keep flat_no for overlay to read
          price: String(booking.price_inr || 0),
          tier: String(tier)
        },
      }),
    });

    if (!sendResponse.ok) {
      const error = await sendResponse.text();
      console.error("❌ FCM send error:", error);
      return new Response(JSON.stringify({ error }), { status: 500, headers: corsHeaders });
    }

    const result = await sendResponse.json();
    console.log(`✅ Tier ${tier} notifications sent:`, result);

    return new Response(
      JSON.stringify({ success: true, tier, sent: workerIds.length, result }),
      { status: 200, headers: corsHeaders }
    );
  } catch (e) {
    console.error("❌ Exception:", e);
    return new Response(`err:${(e as Error)?.message ?? e}`, { status: 500, headers: corsHeaders });
  }
});
