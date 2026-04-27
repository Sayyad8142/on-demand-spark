import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://paywwbuqycovjopryele.supabase.co";
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
    
    console.log(`📢 notify-next-tier: tier=${tier}, booking=${booking_id}`);

    // Get booking data
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, service_type, community, cust_name, flat_no, price_inr, status, booking_type, scheduled_date, scheduled_time, prealert_sent")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      console.error("❌ Booking not found:", bookingError);
      return new Response("booking-not-found", { status: 404, headers: corsHeaders });
    }

    if (booking.status !== "pending") {
      console.log("⏭️ Booking already accepted, skipping");
      return new Response("booking-accepted", { status: 200, headers: corsHeaders });
    }

    if ((booking.booking_type === "scheduled" || (booking.scheduled_date && booking.scheduled_time)) && booking.prealert_sent !== true) {
      console.log("🔕 Scheduled next-tier dispatch blocked until prealert_sent=true", {
        booking_id,
        booking_type: booking.booking_type || "scheduled",
        scheduled_at: booking.scheduled_date && booking.scheduled_time ? `${booking.scheduled_date}T${booking.scheduled_time}` : null,
        prealert_sent: booking.prealert_sent,
        request_status: "pending",
        shown_to_worker: false,
      });
      return new Response(JSON.stringify({ skipped: true, reason: "scheduled_prealert_not_sent", booking_id }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get workers for this tier
    const { data: requests, error: requestsError } = await supabase
      .from("booking_requests")
      .select("worker_id")
      .eq("booking_id", booking_id)
      .eq("order_sequence", tier)
      .eq("status", "pending");

    if (requestsError || !requests?.length) {
      console.log(`⚠️ No workers found for tier ${tier}`);
      return new Response("no-workers", { status: 200, headers: corsHeaders });
    }

    const workerIds = requests.map(r => r.worker_id);
    console.log(`🎯 Sending to ${workerIds.length} tier ${tier} workers: [${workerIds.join(", ")}]`);

    // Stamp push_sent_at + offered_at on these requests so the retry/fallback
    // engine knows when this tier's push actually fired.
    const { error: stampErr } = await supabase
      .from("booking_requests")
      .update({
        push_sent_at: new Date().toISOString(),
        offered_at: new Date().toISOString(),
        last_alert_channel: 'push',
      })
      .eq("booking_id", booking_id)
      .eq("order_sequence", tier)
      .eq("status", "pending")
      .is("push_sent_at", null);
    if (stampErr) console.warn("⚠️ Failed to stamp push_sent_at:", stampErr.message);

    // Build scheduled time display
    let scheduledTimeDisplay = "";
    if (booking.scheduled_date && booking.scheduled_time) {
      const dateObj = new Date(`${booking.scheduled_date}T${booking.scheduled_time}`);
      scheduledTimeDisplay = dateObj.toLocaleString('en-IN', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        hour12: true, timeZone: 'Asia/Kolkata'
      });
    }

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
          booking_type: booking.booking_type || "instant",
          customer: booking.cust_name || "New Customer",
          community: booking.community,
          serviceType: booking.service_type,
          service_type: booking.service_type,
          location: "",
          flat_no: booking.flat_no || "",
          price: String(booking.price_inr || 0),
          tier: String(tier),
          prealert_sent: String(booking.prealert_sent === true),
          scheduled_time: scheduledTimeDisplay,
          scheduled_date: booking.scheduled_date || "",
          scheduled_time_raw: booking.scheduled_time || ""
        },
      }),
    });

    if (!sendResponse.ok) {
      const error = await sendResponse.text();
      console.error(`❌ send-fcm returned ${sendResponse.status}: ${error}`);
      return new Response(JSON.stringify({ error }), { status: 500, headers: corsHeaders });
    }

    const result = await sendResponse.json();
    
    console.log(`📊 notify-next-tier result: sent=${result.sent}, failed=${result.failed}, firebase_project=${result.firebase_project}`);
    
    // Flag SENDER_ID_MISMATCH
    if (result.results) {
      const mismatchCount = result.results.filter((r: any) => r.error_code === "SENDER_ID_MISMATCH").length;
      if (mismatchCount > 0) {
        console.error(`⚠️ SENDER_ID_MISMATCH for ${mismatchCount}/${result.results.length} workers — wrong Firebase service account!`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, tier, sent: workerIds.length, result }),
      { status: 200, headers: corsHeaders }
    );
  } catch (e) {
    console.error("❌ Exception:", e);
    return new Response(`err:${(e as Error)?.message ?? e}`, { status: 500, headers: corsHeaders });
  }
});
