import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { workerId, imageBase64, upiId, upiPayload } = body;

    console.log("📥 admin-upload-qr called for worker:", workerId);

    if (!workerId || !imageBase64) {
      console.error("❌ Missing required fields");
      return new Response(
        JSON.stringify({ error: "workerId and imageBase64 are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Verify worker exists
    const { data: worker, error: workerError } = await supabase
      .from("workers")
      .select("id, full_name, phone, user_id")
      .eq("id", workerId)
      .single();

    if (workerError || !worker) {
      console.error("❌ Worker not found:", workerError);
      return new Response(
        JSON.stringify({ error: "Worker not found", details: workerError }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("✅ Worker found:", worker.full_name, worker.phone);

    // Decode base64 image
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    // Use worker's user_id for the storage path (consistent with app uploads)
    const userId = worker.user_id || workerId;
    const filePath = `${userId}/upi-qr.png`;

    console.log("📤 Uploading to storage path:", filePath);

    // Delete old file if exists (best effort)
    await supabase.storage.from("worker-upi-qr").remove([filePath]);

    // Upload new QR image
    const { error: uploadError } = await supabase.storage
      .from("worker-upi-qr")
      .upload(filePath, imageBytes, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("❌ Storage upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Storage upload failed", details: uploadError }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("✅ Storage upload successful");

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("worker-upi-qr")
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;
    console.log("🔗 Public URL:", publicUrl);

    // Update worker profile
    const updatePayload: Record<string, unknown> = {
      upi_qr_url: publicUrl,
      upi_qr_uploaded_at: new Date().toISOString(),
    };

    if (upiId) {
      updatePayload.upi_id = upiId;
    }
    if (upiPayload) {
      updatePayload.upi_qr_payload = upiPayload;
    }

    const { error: updateError } = await supabase
      .from("workers")
      .update(updatePayload)
      .eq("id", workerId);

    if (updateError) {
      console.error("❌ Worker update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Worker update failed", details: updateError }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("✅ Worker profile updated successfully");

    return new Response(
      JSON.stringify({
        success: true,
        publicUrl,
        workerId,
        workerName: worker.full_name,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
