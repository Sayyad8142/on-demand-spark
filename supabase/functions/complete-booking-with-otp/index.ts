import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://paywwbuqycovjopryele.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COMPLETABLE_STATUSES = ["assigned", "accepted", "on_the_way", "started"];
const VALID_ONLINE_PAYMENT_STATUSES = ["paid", "captured", "settled"];

type BookingRow = {
  id: string;
  worker_id: string | null;
  status: string;
  completion_otp: string | null;
  payment_method: string | null;
  payment_status: string | null;
  worker_collected_payment: boolean | null;
  price_inr: number | null;
  community: string | null;
};

type WorkerPayoutRow = {
  booking_id: string;
  worker_id: string;
  gross_amount: number;
  platform_fee: number;
  payout_amount: number;
  status: string;
  paid_at?: string | null;
  reference_id?: string | null;
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const formatPayout = (payout: WorkerPayoutRow | null) =>
  payout
    ? {
        payout_amount: payout.payout_amount,
        platform_fee: payout.platform_fee,
        gross_amount: payout.gross_amount,
        status: payout.status,
        paid_at: payout.paid_at ?? null,
        reference_id: payout.reference_id ?? null,
      }
    : null;

const normalizeOtp = (value: unknown) => String(value ?? "").replace(/\D/g, "").trim();

async function getExistingPayout(adminClient: any, bookingId: string) {
  const { data, error } = await adminClient
    .from("worker_payouts")
    .select("booking_id, worker_id, gross_amount, platform_fee, payout_amount, status, paid_at, reference_id")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch existing payout:", error);
    throw error;
  }

  return data as WorkerPayoutRow | null;
}

/**
 * Resolve the live platform-fee % for a community.
 * Reads `communities.platform_fee_percent` (admin-controlled).
 * Falls back to 0% if the community is missing or fee is unconfigured —
 * this matches the worker app's fallback so the displayed and actual payout always agree.
 */
async function getCommunityFeePercent(
  adminClient: any,
  community: string | null,
): Promise<number> {
  if (!community) return 0;
  const { data, error } = await adminClient
    .from("communities")
    .select("platform_fee_percent")
    .or(`value.eq.${community},name.eq.${community}`)
    .limit(1)
    .maybeSingle();

  if (error || !data) return 0;
  const pct = Number((data as any).platform_fee_percent ?? 0);
  if (Number.isNaN(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}

async function createOrFetchPayout(
  adminClient: any,
  bookingId: string,
  workerId: string,
  bookingAmount: number,
  community: string | null,
) {
  const platformFeePercent = await getCommunityFeePercent(adminClient, community);
  const platformFee = Math.round((bookingAmount * platformFeePercent) / 100);
  const payoutAmount = bookingAmount - platformFee;

  if (payoutAmount <= 0) {
    return { payout: null, alreadyExisted: false };
  }

  const { data, error } = await adminClient
    .from("worker_payouts")
      .insert({
      booking_id: bookingId,
      worker_id: workerId,
      gross_amount: bookingAmount,
      platform_fee: platformFee,
      payout_amount: payoutAmount,
      status: "pending",
      payout_method: "upi",
        idempotency_key: `booking:${bookingId}`,
      } as any)
    .select("booking_id, worker_id, gross_amount, platform_fee, payout_amount, status, paid_at, reference_id")
    .single();

  if (!error) {
    return { payout: data as WorkerPayoutRow, alreadyExisted: false };
  }

  if (error.code === "23505") {
    const existingPayout = await getExistingPayout(adminClient, bookingId);
    if (existingPayout) {
      return { payout: existingPayout, alreadyExisted: true };
    }
  }

  console.error("Failed to create payout:", error);
  throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { booking_id, otp } = await req.json();
    const enteredOtp = normalizeOtp(otp);
    console.log("[OTP_DEBUG] request_received", {
      booking_id,
      raw_type: typeof otp,
      raw_length: String(otp ?? "").length,
      cleaned_length: enteredOtp.length,
    });

    if (!booking_id || !enteredOtp) {
      return jsonResponse({ error: "booking_id and otp are required" }, 400);
    }

    // Resolve worker from auth user
    const { data: worker } = await adminClient
      .from("workers")
      .select("id")
      .or(`user_id.eq.${user.id},id.eq.${user.id}`)
      .limit(1)
      .maybeSingle();

    if (!worker) {
      return jsonResponse({ error: "Worker not found" }, 404);
    }

    // Fetch booking
    const { data: booking, error: bookingError } = await adminClient
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      return jsonResponse({ error: "Booking not found" }, 404);
    }

    const bookingRow = booking as BookingRow;
    const bookingAmount = bookingRow.price_inr || 0;

    // Check booking belongs to this worker
    if (bookingRow.worker_id !== worker.id) {
      return jsonResponse({ error: "This booking is not assigned to you" }, 403);
    }

    // Idempotent replay: booking already completed → return existing payout or restore missing payout safely
    if (bookingRow.status === "completed") {
      const payoutResult = await createOrFetchPayout(adminClient, booking_id, worker.id, bookingAmount, bookingRow.community);

      return jsonResponse({
        success: true,
        already_completed: true,
        payout_already_exists: payoutResult.alreadyExisted,
        message: payoutResult.alreadyExisted
          ? "Booking already completed. Existing payout reused."
          : "Booking already completed. Missing payout restored.",
        payout: formatPayout(payoutResult.payout),
      });
    }

    // Check booking is in a completable status
    if (!COMPLETABLE_STATUSES.includes(bookingRow.status)) {
      return jsonResponse({ error: `Cannot complete booking in status: ${bookingRow.status}` }, 400);
    }

    // ── Single source of truth: bookings.completion_otp ──
    if (!bookingRow.completion_otp) {
      return jsonResponse({ error: "No completion OTP has been generated for this booking." }, 400);
    }

    const dbOtp = normalizeOtp(bookingRow.completion_otp);
    console.log("[OTP_COMPARE]", {
      booking_id,
      db_type: typeof bookingRow.completion_otp,
      entered_type: typeof otp,
      db_length: dbOtp.length,
      entered_length: enteredOtp.length,
      raw_string_match: String(otp).trim() === String(bookingRow.completion_otp).trim(),
      normalized_match: dbOtp === enteredOtp,
    });

    if (enteredOtp.length !== 4 || dbOtp !== enteredOtp) {
      return jsonResponse({ error: "Invalid OTP. Please check with the customer." }, 400);
    }

    // ── Payment gate removed (online-payment-only platform) ──
    // OTP entry by the worker is the sole source of truth that service was delivered.
    // Payment reconciliation happens out-of-band; never block completion on payment_status.
    console.log("[PAYMENT_CHECK] skipped (online-only model)", {
      booking_id,
      payment_method: bookingRow.payment_method,
      payment_status: bookingRow.payment_status,
    });
    console.log("[BOOKING_STATUS_BEFORE]", { booking_id, status: bookingRow.status });

    // Complete the booking once only; simultaneous replays get no updated row and fall into the idempotent branch below.
    // Writes the new compliance fields required by DB completion guards:
    //   completed_by = 'worker', completion_source = 'otp', otp_verified_at = now()
    const now = new Date().toISOString();
    const { data: completedBooking, error: updateError } = await adminClient
      .from("bookings")
      .update({
        status: "completed",
        completed_at: now,
        completed_by: "worker",
        completion_source: "otp",
        otp_verified_at: now,
        updated_at: now,
      })
      .eq("id", booking_id)
      .eq("worker_id", worker.id)
      .in("status", COMPLETABLE_STATUSES)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("Failed to complete booking:", updateError);
      return jsonResponse({ error: "Could not complete booking. Please try again." }, 500);
    }

    if (!completedBooking) {
      const { data: latestBooking, error: latestBookingError } = await adminClient
        .from("bookings")
        .select("status, worker_id, price_inr, community")
        .eq("id", booking_id)
        .maybeSingle();

      if (latestBookingError || !latestBooking) {
        console.error("Failed to re-check booking after completion race:", latestBookingError);
        return jsonResponse({ error: "Could not verify booking completion. Please try again." }, 500);
      }

      if (latestBooking.worker_id !== worker.id) {
        return jsonResponse({ error: "This booking is not assigned to you" }, 403);
      }

      if (latestBooking.status === "completed") {
        const payoutResult = await createOrFetchPayout(
          adminClient,
          booking_id,
          worker.id,
          latestBooking.price_inr || 0,
          latestBooking.community ?? null,
        );

        return jsonResponse({
          success: true,
          already_completed: true,
          payout_already_exists: payoutResult.alreadyExisted,
          message: payoutResult.alreadyExisted
            ? "Booking already completed. Existing payout reused."
            : "Booking already completed. Missing payout restored.",
          payout: formatPayout(payoutResult.payout),
        });
      }

      return jsonResponse({ error: `Cannot complete booking in status: ${latestBooking.status}` }, 409);
    }

    // Log status change (legacy table)
    await adminClient.from("booking_status_history").insert({
      booking_id,
      from_status: bookingRow.status,
      to_status: "completed",
      changed_by: worker.id,
      note: "Completed via OTP verification by worker",
    });

    // Structured event log
    await adminClient.from("booking_events").insert({
      booking_id,
      type: "completed",
      meta: {
        completed_by: "worker",
        completion_source: "otp",
        otp_verified_at: now,
        worker_id: worker.id,
        from_status: bookingRow.status,
      },
    });

    const payoutResult = await createOrFetchPayout(adminClient, booking_id, worker.id, bookingAmount, bookingRow.community);

    return jsonResponse({
      success: true,
      payout_already_exists: payoutResult.alreadyExisted,
      message: payoutResult.alreadyExisted
        ? "Booking completed successfully. Existing payout reused."
        : "Booking completed successfully",
      payout: formatPayout(payoutResult.payout),
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
