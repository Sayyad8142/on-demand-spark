import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://paywwbuqycovjopryele.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { booking_id, otp } = await req.json();

    if (!booking_id || !otp) {
      return new Response(JSON.stringify({ error: "booking_id and otp are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve worker from auth user
    const { data: worker } = await adminClient
      .from("workers")
      .select("id")
      .or(`user_id.eq.${user.id},id.eq.${user.id}`)
      .limit(1)
      .maybeSingle();

    if (!worker) {
      return new Response(JSON.stringify({ error: "Worker not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch booking
    const { data: booking, error: bookingError } = await adminClient
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: "Booking not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check booking belongs to this worker
    if (booking.worker_id !== worker.id) {
      return new Response(JSON.stringify({ error: "This booking is not assigned to you" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already completed
    if (booking.status === "completed") {
      return new Response(JSON.stringify({ error: "Booking is already completed", already_completed: true }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check booking is in a completable status
    if (!["assigned", "accepted", "on_the_way", "started"].includes(booking.status)) {
      return new Response(JSON.stringify({ error: `Cannot complete booking in status: ${booking.status}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Single source of truth: bookings.completion_otp ──
    if (!booking.completion_otp) {
      return new Response(JSON.stringify({ error: "No completion OTP has been generated for this booking." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (String(otp).trim() !== String(booking.completion_otp).trim()) {
      return new Response(JSON.stringify({ error: "Invalid OTP. Please check with the customer." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Complete the booking
    const now = new Date().toISOString();
    const { error: updateError } = await adminClient
      .from("bookings")
      .update({
        status: "completed",
        completed_at: now,
        updated_at: now,
      })
      .eq("id", booking_id);

    if (updateError) {
      console.error("Failed to complete booking:", updateError);
      return new Response(JSON.stringify({ error: "Failed to complete booking" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log status change
    await adminClient.from("booking_status_history").insert({
      booking_id,
      from_status: booking.status,
      to_status: "completed",
      changed_by: worker.id,
      note: "Completed via OTP verification by worker",
    });

    // Create worker payout record
    const bookingAmount = booking.price_inr || 0;
    const platformFeePercent = 20;
    const platformFee = Math.round(bookingAmount * platformFeePercent / 100);
    const payoutAmount = bookingAmount - platformFee;

    let payoutRecord = null;
    if (payoutAmount > 0) {
      const { data: payout } = await adminClient
        .from("worker_payouts")
        .insert({
          booking_id,
          worker_id: worker.id,
          booking_amount: bookingAmount,
          platform_fee: platformFee,
          payout_amount: payoutAmount,
          status: "pending",
          payout_method: "upi",
        })
        .select()
        .single();

      payoutRecord = payout;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Booking completed successfully",
        payout: payoutRecord
          ? {
              payout_amount: payoutRecord.payout_amount,
              platform_fee: payoutRecord.platform_fee,
              booking_amount: payoutRecord.booking_amount,
              status: payoutRecord.status,
            }
          : null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
