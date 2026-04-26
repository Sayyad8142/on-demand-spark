import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BUCKET = "worker-passbook";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { passbook_path, worker_id, image_data_url } = await req.json();
    if ((!passbook_path || typeof passbook_path !== "string") && (!image_data_url || typeof image_data_url !== "string")) {
      return json({ error: "passbook_path or image_data_url is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (image_data_url) {
      if (!/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/i.test(image_data_url)) {
        return json({ error: "Unsupported image format" }, 400);
      }

      const details = await extractWithAi(image_data_url);
      return json({ success: true, details });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization" }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    if (!passbook_path.startsWith(`${user.id}/`)) {
      return json({ error: "Unauthorized file path" }, 403);
    }

    const { data: worker, error: workerError } = await adminClient
      .from("workers")
      .select("id, user_id")
      .or(`user_id.eq.${user.id},id.eq.${user.id}`)
      .maybeSingle();

    if (workerError || !worker || (worker_id && worker.id !== worker_id)) {
      return json({ error: "Worker not found" }, 404);
    }

    const { data: signed, error: signError } = await adminClient.storage
      .from(BUCKET)
      .createSignedUrl(passbook_path, 60);

    if (signError || !signed?.signedUrl) {
      return json({ error: "Could not read uploaded image" }, 400);
    }

    const details = await extractWithAi(signed.signedUrl);

    const updatePayload: Record<string, string | null> = {
      passbook_url: passbook_path,
      bank_details_source: "passbook",
    };
    if (details.account_holder_name) updatePayload.account_holder_name = details.account_holder_name;
    if (details.bank_account_number) updatePayload.bank_account_number = details.bank_account_number;
    if (details.ifsc_code) updatePayload.ifsc_code = details.ifsc_code;
    if (details.bank_name) updatePayload.bank_name = details.bank_name;

    await adminClient.from("workers").update(updatePayload).eq("id", worker.id);

    return json({ success: true, details });
  } catch (err) {
    console.error("extract-bank-details error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function extractWithAi(imageUrl: string) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("AI extraction is not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "Extract Indian bank account details from passbook/cancelled cheque images. Return only valid JSON with keys account_holder_name, bank_account_number, ifsc_code, bank_name, confidence. Use null for missing fields. Do not guess unclear digits.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Read the bank details from this image." },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`AI extraction failed: ${response.status}`);
  }

  const result = await response.json();
  const raw = result?.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);

  return {
    account_holder_name: cleanText(parsed.account_holder_name),
    bank_account_number: cleanAccount(parsed.bank_account_number),
    ifsc_code: cleanIfsc(parsed.ifsc_code),
    bank_name: cleanText(parsed.bank_name),
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
  };
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanAccount(value: unknown) {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  return /^\d{9,18}$/.test(digits) ? digits : null;
}

function cleanIfsc(value: unknown) {
  const ifsc = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc) ? ifsc : null;
}