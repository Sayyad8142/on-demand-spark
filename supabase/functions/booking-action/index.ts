/**
 * Edge Function: booking-action
 * 
 * Handles booking actions (accept, reject, start, complete) using Firebase authentication.
 * Verifies the Firebase token and performs the action on behalf of the worker.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = "accept" | "reject" | "on_the_way" | "start" | "complete";

interface RequestBody {
  booking_id: string;
  action: Action;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("🔄 booking-action called");

    // Get Firebase token from Authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("❌ Missing or invalid authorization header");
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firebaseToken = authHeader.replace("Bearer ", "");

    // Decode Firebase token to get UID
    let firebaseUid: string;
    try {
      const parts = firebaseToken.split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid JWT format");
      }
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      firebaseUid = payload.user_id || payload.sub;
      
      if (!firebaseUid) {
        throw new Error("No user_id in token");
      }
      
      console.log("✅ Firebase UID:", firebaseUid);
    } catch (err) {
      console.error("❌ Failed to decode Firebase token:", err);
      return new Response(
        JSON.stringify({ error: "Invalid Firebase token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { booking_id, action } = body;

    if (!booking_id || !action) {
      return new Response(
        JSON.stringify({ error: "booking_id and action are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validActions: Action[] = ["accept", "reject", "on_the_way", "start", "complete"];
    if (!validActions.includes(action)) {
      return new Response(
        JSON.stringify({ error: `Invalid action. Must be one of: ${validActions.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createClient(supabaseUrl, serviceRoleKey);

    // Find worker by Firebase UID
    const { data: worker, error: findError } = await supabase
      .from("workers")
      .select("id, full_name, phone, photo_url, upi_id")
      .eq("user_id", firebaseUid)
      .maybeSingle();

    if (findError) {
      console.error("❌ Error finding worker:", findError);
      return new Response(
        JSON.stringify({ error: "Database error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!worker) {
      console.error("❌ No worker found for Firebase UID:", firebaseUid);
      return new Response(
        JSON.stringify({ error: "Worker profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📋 Worker ${worker.id} (${worker.full_name}) performing action: ${action} on booking: ${booking_id}`);

    // Handle different actions
    let result: { success: boolean; error?: string; data?: Record<string, unknown> };

    switch (action) {
      case "accept":
        result = await handleAccept(supabase, booking_id, worker);
        break;
      case "reject":
        result = await handleReject(supabase, booking_id, worker.id);
        break;
      case "on_the_way":
      case "start":
      case "complete":
        result = await handleStatusUpdate(supabase, booking_id, worker.id, action === "on_the_way" ? "on_the_way" : action === "start" ? "started" : "completed");
        break;
      default:
        result = { success: false, error: "Unknown action" };
    }

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("✅ Action completed successfully");

    return new Response(
      JSON.stringify({ success: true, ...(result.data || {}) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Handle accept action using the existing RPC function
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAccept(
  supabase: any,
  bookingId: string,
  worker: { id: string; full_name: string; phone: string; photo_url: string | null; upi_id: string | null }
): Promise<{ success: boolean; error?: string; data?: Record<string, unknown> }> {
  try {
    // Use the existing try_accept_booking RPC which handles concurrency
    const { error } = await supabase.rpc("try_accept_booking", { p_booking_id: bookingId });

    if (error) {
      console.error("❌ Accept RPC error:", error);
      return { success: false, error: error.message || "Failed to accept booking" };
    }

    // Also update the worker info on the booking
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        worker_id: worker.id,
        worker_name: worker.full_name,
        worker_phone: worker.phone,
        worker_photo_url: worker.photo_url,
        worker_upi: worker.upi_id,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .eq("status", "accepted"); // Only update if status was changed to accepted

    if (updateError) {
      console.error("⚠️ Failed to update worker info on booking:", updateError);
      // Don't fail the request, the main accept succeeded
    }

    return { success: true };
  } catch (err) {
    console.error("❌ Accept error:", err);
    return { success: false, error: "Failed to accept booking" };
  }
}

// Handle reject action
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleReject(
  supabase: any,
  bookingId: string,
  workerId: string
): Promise<{ success: boolean; error?: string; data?: Record<string, unknown> }> {
  try {
    // Use the existing reject_booking_request RPC
    const { data, error } = await supabase.rpc("reject_booking_request", {
      p_booking_id: bookingId,
      p_worker_id: workerId,
    });

    if (error) {
      console.error("❌ Reject RPC error:", error);
      return { success: false, error: error.message || "Failed to reject booking" };
    }

    const result = data as { success?: boolean; should_notify?: boolean; next_tier?: number } | null;

    // If next tier should be notified, invoke the notify function
    if (result?.should_notify && result?.next_tier) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        
        await fetch(`${supabaseUrl}/functions/v1/notify-next-tier`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            booking_id: bookingId,
            tier: result.next_tier,
          }),
        });
        console.log(`✅ Notified next tier ${result.next_tier}`);
      } catch (notifyError) {
        console.error("⚠️ Error notifying next tier:", notifyError);
        // Don't fail the rejection if notification fails
      }
    }

    return { success: true, data: { should_notify: result?.should_notify } };
  } catch (err) {
    console.error("❌ Reject error:", err);
    return { success: false, error: "Failed to reject booking" };
  }
}

// Handle status updates (on_the_way, started, completed)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleStatusUpdate(
  supabase: any,
  bookingId: string,
  workerId: string,
  newStatus: string
): Promise<{ success: boolean; error?: string; data?: Record<string, unknown> }> {
  try {
    // Verify the booking belongs to this worker
    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("id, status, worker_id")
      .eq("id", bookingId)
      .single();

    if (fetchError || !booking) {
      console.error("❌ Booking not found:", fetchError);
      return { success: false, error: "Booking not found" };
    }

    if (booking.worker_id !== workerId) {
      console.error("❌ Worker doesn't own this booking");
      return { success: false, error: "You are not assigned to this booking" };
    }

    // Determine timestamp field to update
    const timestampField = 
      newStatus === "on_the_way" ? "on_the_way_at" :
      newStatus === "started" ? "started_at" :
      newStatus === "completed" ? "completed_at" : null;

    const updateData: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (timestampField) {
      updateData[timestampField] = new Date().toISOString();
    }

    // If completing, also set is_busy to false for the worker
    if (newStatus === "completed") {
      await supabase
        .from("workers")
        .update({ is_busy: false, updated_at: new Date().toISOString() })
        .eq("id", workerId);
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update(updateData)
      .eq("id", bookingId);

    if (updateError) {
      console.error("❌ Status update error:", updateError);
      return { success: false, error: updateError.message || "Failed to update status" };
    }

    console.log(`✅ Booking ${bookingId} status updated to ${newStatus}`);
    return { success: true };
  } catch (err) {
    console.error("❌ Status update error:", err);
    return { success: false, error: "Failed to update booking status" };
  }
}
