import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    console.log("📥 accept-booking invoked");

    // Get JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error("❌ No authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Get user from JWT
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      console.error("❌ Invalid token:", userError);
      return new Response(JSON.stringify({ error: "Invalid token" }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    console.log("✅ Authenticated user:", user.id);

    // Get booking_id from request
    const { booking_id } = await req.json();
    
    if (!booking_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(booking_id)) {
      console.error("❌ Invalid booking_id");
      return new Response(JSON.stringify({ error: "Invalid booking_id" }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    console.log("🔍 Accepting booking:", booking_id);

    // Find worker by user_id
    const { data: worker, error: workerError } = await supabase
      .from("workers")
      .select("id, is_busy")
      .eq("user_id", user.id)
      .single();

    if (workerError || !worker) {
      console.error("❌ Worker not found:", workerError);
      return new Response(JSON.stringify({ error: "Worker not found" }), { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (worker.is_busy) {
      console.error("❌ Worker is already busy");
      return new Response(JSON.stringify({ error: "Worker is already busy" }), { 
        status: 409, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const workerId = worker.id;
    console.log("✅ Worker found:", workerId);

    // Try to accept using RPC function
    const { data: result, error: rpcError } = await supabase.rpc("try_accept_booking", {
      p_booking_id: booking_id,
      p_worker_id: workerId
    });

    if (rpcError) {
      console.error("❌ RPC error:", rpcError);
      return new Response(JSON.stringify({ error: rpcError.message }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (!result) {
      console.log("⚠️ Booking already accepted by another worker");
      return new Response(JSON.stringify({ error: "Booking already accepted" }), { 
        status: 409, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Update additional fields
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        approved_by_worker: true,
        assigned_at: now,
        confirmed_at: now,
        updated_at: now
      })
      .eq("id", booking_id);

    if (updateError) {
      console.error("❌ Update error:", updateError);
    }

    // Mark worker as busy
    const { error: busyError } = await supabase
      .from("workers")
      .update({ is_busy: true, updated_at: now })
      .eq("id", workerId);

    if (busyError) {
      console.error("❌ Worker busy update error:", busyError);
    }

    console.log("✅ Booking accepted successfully");

    return new Response(
      JSON.stringify({ ok: true, booking_id }), 
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error("❌ Exception in accept-booking:", e);
    return new Response(
      JSON.stringify({ error: (e as Error)?.message ?? "Unknown error" }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
