import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FCM_SERVER_KEY = Deno.env.get("FCM_SERVER_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function sendFcm(token: string, bookingId: string) {
  // Simple legacy HTTP send; works with FCM_SERVER_KEY
  const payload = {
    to: token,
    data: { type: "BOOKING_ALERT", bookingId },
    notification: { title: "New Booking", body: "Tap to review & accept" },
  };
  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `key=${FCM_SERVER_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

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
    const { data: tokens } = await supabase
      .from("fcm_tokens")
      .select("user_id, token")
      .in("user_id", workerIds);

    let sent = 0;
    for (const t of tokens ?? []) {
      const ok = await sendFcm(t.token, booking_id);
      if (ok) sent++;
    }
    return new Response(JSON.stringify({ sent }), { status: 200 });
  } catch (e) {
    return new Response(`err:${(e as Error)?.message ?? e}`, { status: 500 });
  }
});
