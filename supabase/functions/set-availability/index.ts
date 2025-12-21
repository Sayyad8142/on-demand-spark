/**
 * Edge Function: set-availability
 * 
 * Updates worker availability using Firebase authentication.
 * Verifies the Firebase token and updates the worker's is_available flag.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseToken } from "../_shared/verifyFirebase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  is_available: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("🔄 set-availability called");

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

    // Verify Firebase token using Admin SDK
    let decoded;
    try {
      decoded = await verifyFirebaseToken(firebaseToken);
    } catch (err) {
      console.error("❌ Firebase token verification failed:", err);
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid Firebase token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firebaseUid = decoded.uid;

    if (!firebaseUid) {
      console.error("❌ No UID in verified token");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("✅ Firebase UID:", firebaseUid);

    // Parse request body
    const body: RequestBody = await req.json();
    const { is_available } = body;

    if (typeof is_available !== "boolean") {
      return new Response(
        JSON.stringify({ error: "is_available must be a boolean" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find worker by Firebase UID
    const { data: worker, error: findError } = await supabase
      .from("workers")
      .select("id, full_name, is_available")
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

    // Update availability
    console.log(`🔄 Updating worker ${worker.id} availability: ${worker.is_available} -> ${is_available}`);
    
    const { error: updateError } = await supabase
      .from("workers")
      .update({ 
        is_available, 
        updated_at: new Date().toISOString(),
        last_active_at: new Date().toISOString()
      })
      .eq("id", worker.id);

    if (updateError) {
      console.error("❌ Error updating availability:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update availability" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("✅ Availability updated successfully");

    return new Response(
      JSON.stringify({ 
        success: true, 
        worker_id: worker.id,
        is_available 
      }),
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
