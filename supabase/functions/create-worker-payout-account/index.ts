import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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

    // Init Supabase with user token
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    const { worker_id, account_holder_name, upi_id } = await req.json();

    if (!worker_id || !account_holder_name || !upi_id) {
      return new Response(JSON.stringify({ error: "worker_id, account_holder_name, and upi_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate UPI format (basic)
    if (!/^[\w.\-]+@[\w]+$/.test(upi_id)) {
      return new Response(JSON.stringify({ error: "Invalid UPI ID format. Example: name@upi" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the worker belongs to this user
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: worker, error: workerErr } = await adminClient
      .from("workers")
      .select("id, user_id, phone, full_name, payout_ready")
      .eq("id", worker_id)
      .single();

    if (workerErr || !worker) {
      return new Response(JSON.stringify({ error: "Worker not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (worker.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized: worker does not belong to you" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (worker.payout_ready) {
      return new Response(JSON.stringify({ error: "Payout account already set up" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // RazorpayX API calls
    const razorpayKeyId = Deno.env.get("RAZORPAYX_KEY_ID");
    const razorpayKeySecret = Deno.env.get("RAZORPAYX_KEY_SECRET");

    if (!razorpayKeyId || !razorpayKeySecret) {
      console.error("RazorpayX credentials not configured");
      return new Response(JSON.stringify({ error: "Payment setup is not configured. Please contact support." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authString = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
    const razorpayHeaders = {
      "Content-Type": "application/json",
      Authorization: `Basic ${authString}`,
    };

    // Step 1: Create Contact
    const contactRes = await fetch("https://api.razorpay.com/v1/contacts", {
      method: "POST",
      headers: razorpayHeaders,
      body: JSON.stringify({
        name: account_holder_name,
        contact: worker.phone || undefined,
        type: "vendor",
        reference_id: worker_id,
      }),
    });

    const contactData = await contactRes.json();
    if (!contactRes.ok) {
      console.error("RazorpayX contact creation failed:", contactData);
      await adminClient.from("workers").update({
        payout_last_error: `Contact creation failed: ${contactData.error?.description || JSON.stringify(contactData)}`,
      }).eq("id", worker_id);
      return new Response(JSON.stringify({ error: "Failed to create payout contact. Please try again." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Create Fund Account (UPI)
    const fundRes = await fetch("https://api.razorpay.com/v1/fund_accounts", {
      method: "POST",
      headers: razorpayHeaders,
      body: JSON.stringify({
        contact_id: contactData.id,
        account_type: "vpa",
        vpa: { address: upi_id },
      }),
    });

    const fundData = await fundRes.json();
    if (!fundRes.ok) {
      console.error("RazorpayX fund account creation failed:", fundData);
      await adminClient.from("workers").update({
        payout_last_error: `Fund account creation failed: ${fundData.error?.description || JSON.stringify(fundData)}`,
      }).eq("id", worker_id);
      return new Response(JSON.stringify({ error: "Failed to link UPI. Please check UPI ID and try again." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Update worker record
    const { error: updateErr } = await adminClient
      .from("workers")
      .update({
        account_holder_name,
        upi_id,
        payout_ready: true,
        payout_verified_at: new Date().toISOString(),
        payout_last_error: null,
        razorpay_contact_id: contactData.id,
        razorpay_fund_account_id: fundData.id,
      })
      .eq("id", worker_id);

    if (updateErr) {
      console.error("Failed to update worker after payout setup:", updateErr);
      return new Response(JSON.stringify({ error: "Payout linked but profile update failed. Please contact support." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Payout setup completed",
        contact_id: contactData.id,
        fund_account_id: fundData.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
