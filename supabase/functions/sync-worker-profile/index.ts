/**
 * Edge Function: sync-worker-profile
 * 
 * Syncs a worker profile using Firebase authentication.
 * Maps Firebase UID to the worker record.
 * 
 * Called after login to link/create worker profile.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseToken } from "../_shared/verifyFirebase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  phone: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("🔄 sync-worker-profile called");

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
    const phoneFromToken = decoded.phone_number || null;

    if (!firebaseUid) {
      console.error("❌ No UID in verified token");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("✅ Firebase UID:", firebaseUid, "Phone:", phoneFromToken);

    // Parse request body
    const body: RequestBody = await req.json().catch(() => ({ phone: "" }));
    const phone = body.phone || phoneFromToken;

    if (!phone) {
      console.error("❌ No phone number provided");
      return new Response(
        JSON.stringify({ error: "Phone number required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Check if worker exists by phone
    const { data: existingWorker, error: checkError } = await supabase
      .from("workers")
      .select("id, user_id, full_name")
      .eq("phone", phone)
      .maybeSingle();

    if (checkError) {
      console.error("❌ Error checking worker:", checkError);
      return new Response(
        JSON.stringify({ error: "Database error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let workerId: string | null = null;

    if (existingWorker) {
      // Worker exists - link to Firebase UID if not already linked
      if (existingWorker.user_id !== firebaseUid) {
        console.log("🔗 Linking worker", existingWorker.id, "to Firebase UID:", firebaseUid);
        
        const { error: updateError } = await supabase
          .from("workers")
          .update({ user_id: firebaseUid, updated_at: new Date().toISOString() })
          .eq("id", existingWorker.id);

        if (updateError) {
          console.error("❌ Error linking worker:", updateError);
          return new Response(
            JSON.stringify({ error: "Failed to link worker profile" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.log("✅ Worker linked successfully");
      } else {
        console.log("✅ Worker already linked to Firebase UID");
      }
      workerId = existingWorker.id;
    } else {
      // No worker found - this is OK for sign-in (worker created during sign-up)
      console.log("⚠️ No worker found for phone:", phone);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        workerId,
        message: workerId ? "Worker profile synced" : "No worker profile found"
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
