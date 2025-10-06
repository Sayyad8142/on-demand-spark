import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

serve(async (req) => {
  try {
    const { booking_id } = await req.json();
    if (!booking_id) return new Response("missing booking_id", { status: 400 });

    // Load booking; only proceed for pending
    const { data: b, error: be } = await supabase
      .from("bookings")
      .select("id, status, service_type, community")
      .eq("id", booking_id)
      .single();
    if (be || !b || b.status !== "pending") return new Response("skip", { status: 200 });

    // Eligible workers: active, available, not busy, matching service & community
    const { data: workers, error: we } = await supabase
      .from("workers")
      .select("id")
      .eq("is_active", true)
      .eq("is_available", true)
      .eq("is_busy", false)
      .contains("service_types", [b.service_type])
      .contains("communities", [b.community]);
    if (we || !workers?.length) return new Response("no-workers", { status: 200 });

    const workerIds = workers.map((w) => w.id);

    // Call send-onesignal edge function
    const sendResult = await supabase.functions.invoke("send-onesignal", {
      body: {
        externalUserIds: workerIds,
        headings: { en: "New Booking Alert!" },
        contents: { en: `${b.service_type} booking in ${b.community}. Tap to accept.` },
        data: { bookingId: booking_id, type: "BOOKING_ALERT" },
      },
    });

    if (sendResult.error) {
      console.error("OneSignal send error:", sendResult.error);
      return new Response(JSON.stringify({ error: sendResult.error }), { status: 500 });
    }

    return new Response(JSON.stringify({ sent: workerIds.length, result: sendResult.data }), { status: 200 });
  } catch (e) {
    return new Response(`err:${(e as Error)?.message ?? e}`, { status: 500 });
  }
});
