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
    console.log("📥 reassign-booking invoked");

    const { booking_id, reject_reason } = await req.json();
    
    if (!booking_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(booking_id)) {
      console.error("❌ Invalid booking_id");
      return new Response(JSON.stringify({ error: "Invalid booking_id" }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    console.log("🔍 Reassigning booking:", booking_id, "reason:", reject_reason);

    // Get booking details
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, service_type, community, cust_name, flat_no, price_inr, worker_id")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      console.error("❌ Booking not found:", bookingError);
      return new Response(JSON.stringify({ error: "Booking not found" }), { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Clear current worker assignment
    const { error: clearError } = await supabase
      .from("bookings")
      .update({ 
        worker_id: null,
        status: "pending",
        updated_at: new Date().toISOString()
      })
      .eq("id", booking_id);

    if (clearError) {
      console.error("❌ Error clearing worker:", clearError);
    }

    // Find next available worker in same community/service, ordered by rating
    const { data: nextWorkers, error: workersError } = await supabase
      .from("workers")
      .select("id, full_name, user_id, rating")
      .eq("is_active", true)
      .eq("is_available", true)
      .eq("is_busy", false)
      .contains("service_types", [booking.service_type])
      .or(`community.eq.${booking.community},community.is.null`)
      .neq("id", booking.worker_id || "") // Exclude previous worker
      .order("rating", { ascending: false })
      .limit(5);

    if (workersError || !nextWorkers?.length) {
      console.log("⚠️ No other eligible workers found");
      return new Response(
        JSON.stringify({ ok: true, message: "No other workers available" }), 
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userIds = nextWorkers
      .map((w) => w.user_id || w.id)
      .filter(Boolean);

    console.log(`✅ Found ${nextWorkers.length} next workers:`, nextWorkers.map(w => w.full_name).join(", "));

    // Send FCM to next batch of workers
    const fcmUrl = `${SUPABASE_URL}/functions/v1/send-fcm`;
    console.log("📤 Calling send-fcm for reassignment");
    
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
          type: "new_booking",
          booking_id: booking_id,
          service_type: booking.service_type,
          flat_number: booking.flat_no || "",
          price_inr: String(booking.price_inr || 0),
          notes: "",
          community: booking.community,
          image_url: ""
        },
      }),
    });

    if (!sendResponse.ok) {
      const error = await sendResponse.text();
      console.error("❌ FCM send error:", error);
    } else {
      const result = await sendResponse.json();
      console.log("✅ FCM notifications sent for reassignment:", result);
    }

    return new Response(
      JSON.stringify({ ok: true, reassigned_to: nextWorkers.length }), 
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error("❌ Exception in reassign-booking:", e);
    return new Response(
      JSON.stringify({ error: (e as Error)?.message ?? "Unknown error" }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
