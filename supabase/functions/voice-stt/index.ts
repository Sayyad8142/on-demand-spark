// Voice Assistant — Speech-to-Text proxy.
// Forwards multipart audio to the Lovable AI Gateway.
// Kept server-side so LOVABLE_API_KEY never leaves the backend.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";
const MODEL = "openai/gpt-4o-transcribe";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MiB safety cap

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "missing_lovable_api_key" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const inbound = await req.formData();
    const file = inbound.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return new Response(JSON.stringify({ error: "missing_or_empty_file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (file.size > MAX_BYTES) {
      return new Response(JSON.stringify({ error: "file_too_large", max_bytes: MAX_BYTES }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rebuild the multipart body targeting the model we want.
    const upstream = new FormData();
    upstream.append("model", MODEL);
    upstream.append("file", file, file.name || "recording.wav");
    // Do NOT hardcode `language` — auto-detect Telugu/Hindi/English.
    // If the caller passed a hint, forward it.
    const langHint = inbound.get("language");
    if (typeof langHint === "string" && /^[a-z]{2}$/i.test(langHint)) {
      upstream.append("language", langHint);
    }

    const gwRes = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });

    const bodyText = await gwRes.text();
    if (!gwRes.ok) {
      console.error(`[voice-stt] gateway ${gwRes.status}: ${bodyText.slice(0, 500)}`);
      return new Response(
        JSON.stringify({ error: "gateway_error", status: gwRes.status, details: bodyText.slice(0, 500) }),
        { status: gwRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Gateway returns JSON { text, ... }. Pass it through.
    return new Response(bodyText, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[voice-stt] error", err);
    return new Response(JSON.stringify({ error: "internal_error", message: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
