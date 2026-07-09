// Voice Assistant — Text-to-Speech proxy.
// Non-streaming MP3 for simplicity; assistant replies are short and playback
// starts within ~1s. Client just plays the returned audio blob.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/audio/speech";
const MODEL = "openai/gpt-4o-mini-tts";
const MAX_INPUT_CHARS = 4000;

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

  let body: {
    text?: unknown;
    voice?: unknown;
    language?: unknown;
    instructions?: unknown;
    speed?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return new Response(JSON.stringify({ error: "missing_text" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const clipped = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;

  const voice = typeof body.voice === "string" && body.voice ? body.voice : "alloy";
  const language = typeof body.language === "string" ? body.language : "en";
  const baseInstruction =
    language === "hi"
      ? "Speak in warm, friendly Hindi. Speak clearly at a natural pace."
      : language === "te"
      ? "Speak in warm, friendly Telugu. Speak clearly at a natural pace."
      : "Speak in warm, friendly Indian English. Speak clearly at a natural pace.";
  const extra = typeof body.instructions === "string" ? body.instructions : "";
  const instructions = extra ? `${baseInstruction} ${extra}` : baseInstruction;

  try {
    const gwRes = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: clipped,
        voice,
        response_format: "mp3",
        instructions,
        speed: typeof body.speed === "number" ? body.speed : 1.0,
      }),
    });

    if (!gwRes.ok) {
      const details = await gwRes.text().catch(() => "");
      console.error(`[voice-tts] gateway ${gwRes.status}: ${details.slice(0, 500)}`);
      return new Response(
        JSON.stringify({ error: "gateway_error", status: gwRes.status, details: details.slice(0, 500) }),
        { status: gwRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(gwRes.body, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[voice-tts] error", err);
    return new Response(JSON.stringify({ error: "internal_error", message: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
