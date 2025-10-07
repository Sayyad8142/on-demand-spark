import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req) => {
  try {
    console.log("📥 booking-notifications invoked");
    const { booking_id } = await req.json();
    
    if (!booking_id) {
      console.error("❌ No booking_id provided");
      return new Response("missing booking_id", { status: 400 });
    }

    console.log("🔍 Loading booking:", booking_id);
    
    // Load booking with cust_name field
    const { data: b, error: be } = await supabase
      .from("bookings")
      .select("id, status, service_type, community, cust_name, cust_phone, flat_no")
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
      .select("id, full_name")
      .eq("is_active", true)
      .eq("is_available", true)
      .eq("is_busy", false)
      .contains("service_types", [b.service_type])
      .contains("communities", [b.community]);
      
    if (we) {
      console.error("❌ Workers load error:", we);
      return new Response(JSON.stringify({ error: we.message }), { status: 500 });
    }
    
    if (!workers?.length) {
      console.log("⚠️ No eligible workers found");
      return new Response("no-workers", { status: 200 });
    }

    const workerIds = workers.map((w) => w.id);
    console.log(`✅ Found ${workers.length} eligible workers:`, workers.map(w => w.full_name).join(", "));

    // Call send-onesignal edge function via HTTP
    const oneSignalUrl = `${SUPABASE_URL}/functions/v1/send-onesignal`;
    console.log("📤 Calling send-onesignal for workers:", workerIds);
    
    const sendResponse = await fetch(oneSignalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        externalUserIds: workerIds,
        headings: { en: "New Booking Alert!" },
        contents: { en: `${b.service_type.replace('_', ' ')} in ${b.community}. Tap to accept!` },
        data: { 
          type: "BOOKING_ALERT",
          bookingId: booking_id, 
          customer: b.cust_name || "New Customer",
          community: b.community,
          serviceType: b.service_type,
          location: b.flat_no || ""
        },
      }),
    });

    if (!sendResponse.ok) {
      const error = await sendResponse.text();
      console.error("❌ OneSignal send error:", error);
      return new Response(JSON.stringify({ error }), { status: 500 });
    }

    const result = await sendResponse.json();
    console.log("✅ OneSignal notifications sent successfully:", result);
    
    return new Response(
      JSON.stringify({ 
        success: true,
        sent: workerIds.length, 
        workers: workers.map(w => ({ id: w.id, name: w.full_name })),
        result 
      }), 
      { status: 200 }
    );
  } catch (e) {
    console.error("❌ Exception in booking-notifications:", e);
    return new Response(`err:${(e as Error)?.message ?? e}`, { status: 500 });
  }
});
