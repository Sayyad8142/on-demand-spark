// Voice Assistant — Master agent.
// Read-only Phase 1: answers worker questions using their own live data.
// - Verifies the caller's JWT and looks up the worker row.
// - Runs a tool-call loop against Lovable AI Gateway (OpenAI chat completions).
// - Persists conversation turns to voice_conversations / voice_messages.
// No writes to worker/booking/payout tables. Navigation is returned to the client.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview"; // fast, cheap, multilingual, tool-calling
const MAX_TOOL_ROUNDS = 4;

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

const CHAT_SYSTEM_PROMPT = `You are "Didi", the personal voice trainer inside the Didi Now Partner worker app.
Workers are house-service professionals (maids, bathroom cleaners) in Indian gated communities. Many have low tech literacy.

TONE
- Warm, encouraging, human — like a friendly trainer. Never robotic.
- Celebrate wins ("Wonderful!", "Great work!"). Reassure on mistakes.
- Reply in the SAME language the worker used (English, Hindi, or Telugu). Detect from their message.
- Keep replies to 1–2 short sentences. No markdown, lists, code, or emojis.
- Currency in Indian rupees; say "rupees", not INR or ₹.

RULES
- For any question about the worker's own data, call the matching read tool FIRST.
- To open a screen, call navigate_to_screen. Do NOT describe navigation in words.
- To change any worker setting, call propose_write. NEVER claim you saved anything until the worker taps Confirm on their screen. The app handles the actual save.
- Never invent numbers, dates, or bookings. If a tool returns nothing, say so honestly.
- Never reveal customer phone numbers or private details.
- If unsure, ask ONE short clarifying question in the worker's language.`;

const SIGNUP_SYSTEM_PROMPT = `You are "Didi", a warm voice assistant helping a new worker sign up in the Didi Now Partner app.
The worker may speak English, Hindi, or Telugu. Detect language from their reply and mirror it.

GOAL: Collect these fields ONE AT A TIME, in this order, filling the form via capture_signup_field:
1) full_name (their name)
2) phone (10-digit Indian mobile number)
3) community (they will pick from a list on-screen; if they say a name, pass it as text and let them confirm on-screen)
4) services (one or both of: "Maid", "Bathroom Cleaning")
5) upi_id (their UPI address, e.g. name@bank; may also come from QR or upload — that's fine, just skip if they say they'll scan)

FLOW
- Greet warmly on the first turn only: welcome them and say they can speak in Telugu, Hindi, or English.
- Ask for the NEXT missing field only. Never ask multiple things at once.
- After the worker answers, call capture_signup_field({field, value}) FIRST, then read the value back and ask "Is that correct?" in their language. Keep it under 12 words.
- If they say yes/correct/haan/sari, move to the next missing field.
- If they say no/change it, ask again for that field only.
- When all 5 fields are captured, say a short "All done! Please tap Create Account." in their language.
- No emojis, no lists, no markdown. Short spoken sentences only.`;

const TOUR_SYSTEM_PROMPT = `You are "Didi", a friendly coach explaining the Didi Now Partner worker app.
Answer the worker's question about the app in 1–2 short sentences, in the worker's language (English/Hindi/Telugu).
Never use markdown, lists, code, or emojis. Never invent numbers. Encourage them.`;

function buildTools(mode: string) {
  const readTools = [
    { name: "get_worker_profile", description: "Read the worker's own profile (name, services, community, online status, payout readiness)." },
    { name: "get_priority_score", description: "Read the worker's current Priority Score, tier, and recent reason." },
    { name: "get_earnings_summary", description: "Sum today / week / month earnings, plus pending and failed payout counts." },
    { name: "get_bookings_summary", description: "Counts of completed, cancelled, and active bookings in the last 30 days." },
    { name: "get_ratings_summary", description: "Average rating, total review count, and up to 3 latest reviews." },
    { name: "get_availability", description: "Availability slots grouped by day." },
    { name: "get_health_status", description: "Notification and FCM health flags (push token, permissions)." },
  ].map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: { type: "object", properties: {}, additionalProperties: false } },
  }));

  const navTool = {
    type: "function" as const,
    function: {
      name: "navigate_to_screen",
      description: "Open a screen in the app when the worker asks to open something.",
      parameters: {
        type: "object",
        properties: {
          screen: {
            type: "string",
            enum: ["home","bookings","availability","profile","earnings","customer-reviews","account-details","settings","contact-support","troubleshoot"],
          },
        },
        required: ["screen"],
        additionalProperties: false,
      },
    },
  };

  const proposeWrite = {
    type: "function" as const,
    function: {
      name: "propose_write",
      description: "Propose a change the worker must confirm with a tap. The app shows a Confirm button and only then saves. Use for: update_upi, update_name, set_online, set_offline.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["update_upi","update_name","set_online","set_offline"] },
          value: { type: "string", description: "New value (name text, UPI id). Omit for online/offline toggles." },
          spoken_confirmation: { type: "string", description: "One short sentence in the worker's language read aloud before confirmation, e.g. 'Set UPI to name at bank. Tap Confirm to save.'" },
        },
        required: ["type","spoken_confirmation"],
        additionalProperties: false,
      },
    },
  };

  const captureSignup = {
    type: "function" as const,
    function: {
      name: "capture_signup_field",
      description: "Fill one signup form field on the screen. Call BEFORE reading the value back for confirmation.",
      parameters: {
        type: "object",
        properties: {
          field: { type: "string", enum: ["full_name","phone","community","services","upi_id"] },
          value: { type: "string", description: "For services, comma-separate: 'Maid' or 'Bathroom Cleaning' or 'Maid, Bathroom Cleaning'." },
        },
        required: ["field","value"],
        additionalProperties: false,
      },
    },
  };

  if (mode === "signup") return [captureSignup];
  if (mode === "tour") return [navTool];
  return [...readTools, navTool, proposeWrite];
}


function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!apiKey || !supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }

  let body: { messages?: unknown; conversationId?: unknown; language?: unknown; mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const inboundMessages = Array.isArray(body.messages) ? body.messages : [];
  if (inboundMessages.length === 0) return jsonResponse({ error: "missing_messages" }, 400);
  const language = typeof body.language === "string" ? body.language : "en";
  const mode = body.mode === "signup" || body.mode === "tour" ? body.mode : "chat";

  // Signup mode runs BEFORE the worker exists, so auth is optional there.
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  let userId: string | null = null;
  if (token) {
    const { data: userRes } = await supabase.auth.getUser(token);
    userId = userRes?.user?.id ?? null;
  }
  if (mode !== "signup" && !userId) return jsonResponse({ error: "unauthorized" }, 401);

  // Resolve worker row for this user (chat/tour modes only).
  let workerRow: any = null;
  if (userId) {
    const { data } = await supabase
      .from("workers")
      .select(
        "id, user_id, full_name, phone, services, community, is_available, priority_score, priority_score_reason, rating, total_reviews, upi_id, payout_ready, fcm_token, fcm_token_status, notification_permission_granted, overlay_permission_granted",
      )
      .or(`user_id.eq.${userId},id.eq.${userId}`)
      .maybeSingle();
    workerRow = data;
  }
  const workerId = workerRow?.id ?? null;

  const readTools: Record<string, () => Promise<unknown>> = {
    get_worker_profile: async () => workerRow ? {
      name: workerRow.full_name, services: workerRow.services, community: workerRow.community,
      is_online: workerRow.is_available, payout_ready: workerRow.payout_ready, upi_set: !!workerRow.upi_id,
    } : { error: "no_worker_profile" },
    get_priority_score: async () => {
      if (!workerRow) return { error: "no_worker_profile" };
      const score = workerRow.priority_score ?? 50;
      return { score, tier: score >= 80 ? "top" : score >= 60 ? "mid" : "low", reason: workerRow.priority_score_reason || null };
    },
    get_earnings_summary: async () => {
      if (!workerId) return { error: "no_worker_profile" };
      const now = new Date();
      const startOfToday = new Date(now); startOfToday.setHours(0,0,0,0);
      const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0,0,0,0);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const { data: payouts } = await supabase.from("worker_payouts")
        .select("payout_amount, status, created_at").eq("worker_id", workerId)
        .gte("created_at", startOfMonth.toISOString()).limit(500);
      const rows = payouts || [];
      const sum = (from: Date) => rows.filter((r: any) => new Date(r.created_at) >= from && ["paid","processing","pending"].includes(r.status))
        .reduce((a: number, r: any) => a + Number(r.payout_amount || 0), 0);
      return {
        today_rupees: Math.round(sum(startOfToday)),
        this_week_rupees: Math.round(sum(startOfWeek)),
        this_month_rupees: Math.round(sum(startOfMonth)),
        pending_count: rows.filter((r: any) => ["pending","processing"].includes(r.status)).length,
        failed_count: rows.filter((r: any) => r.status === "failed").length,
      };
    },
    get_bookings_summary: async () => {
      if (!workerId) return { error: "no_worker_profile" };
      const from = new Date(); from.setDate(from.getDate() - 30);
      const { data: bookings } = await supabase.from("bookings").select("status").eq("worker_id", workerId)
        .gte("created_at", from.toISOString()).limit(500);
      const rows = bookings || [];
      const count = (s: string) => rows.filter((r: any) => r.status === s).length;
      return {
        window_days: 30, completed: count("completed"), cancelled: count("cancelled"),
        active: rows.filter((r: any) => ["assigned","accepted","on_the_way","started"].includes(r.status)).length,
        total: rows.length,
      };
    },
    get_ratings_summary: async () => {
      if (!workerId) return { error: "no_worker_profile" };
      const { data: ratings } = await supabase.from("worker_ratings")
        .select("rating, comment, created_at").eq("worker_id", workerId)
        .order("created_at", { ascending: false }).limit(3);
      return {
        average: workerRow?.rating ?? null, total_reviews: workerRow?.total_reviews ?? 0,
        latest: (ratings || []).map((r: any) => ({ rating: r.rating, comment: r.comment ? String(r.comment).slice(0,120) : null, when: r.created_at })),
      };
    },
    get_availability: async () => {
      if (!workerId) return { error: "no_worker_profile" };
      const { data } = await supabase.from("worker_availability").select("day_of_week, slots").eq("worker_id", workerId);
      const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      return { by_day: (data || []).map((r: any) => ({ day: days[r.day_of_week] ?? r.day_of_week, slot_count: Array.isArray(r.slots) ? r.slots.length : 0 })) };
    },
    get_health_status: async () => workerRow ? {
      fcm_token_present: !!workerRow.fcm_token, fcm_token_status: workerRow.fcm_token_status || "unknown",
      notifications_allowed: workerRow.notification_permission_granted !== false,
      overlay_allowed: workerRow.overlay_permission_granted !== false,
    } : { error: "no_worker_profile" },
  };

  const clientNavigations: string[] = [];
  const formPatch: Record<string, string> = {};
  let pendingAction: { type: string; value?: string; spoken_confirmation: string } | null = null;

  const TOOL_LIST = buildTools(mode);
  const systemPrompt = mode === "signup" ? SIGNUP_SYSTEM_PROMPT : mode === "tour" ? TOUR_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT;

  // --- conversation record (only if authenticated) ---
  let conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
  if (userId && !conversationId) {
    const { data } = await supabase.from("voice_conversations")
      .insert({ user_id: userId, worker_id: workerId, language }).select("id").single();
    conversationId = data?.id ?? null;
  }
  const lastUser = [...inboundMessages].reverse().find((m: any) => m?.role === "user");
  if (userId && conversationId && lastUser?.content) {
    await supabase.from("voice_messages").insert({
      conversation_id: conversationId, user_id: userId, role: "user",
      content: String(lastUser.content).slice(0, 4000), language,
    });
  }

  const trimmed = inboundMessages.slice(-20);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...trimmed as ChatMessage[],
  ];

  let assistantFinal = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const gwRes = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages, tools: TOOL_LIST, tool_choice: "auto" }),
    });

    if (!gwRes.ok) {
      const details = await gwRes.text().catch(() => "");
      console.error(`[voice-assistant] gateway ${gwRes.status}: ${details.slice(0, 500)}`);
      const status = gwRes.status === 429 || gwRes.status === 402 ? gwRes.status : 500;
      return jsonResponse({ error: "gateway_error", status: gwRes.status, details: details.slice(0, 500) }, status);
    }

    const payload = await gwRes.json();
    const choice = payload?.choices?.[0]?.message;
    if (!choice) return jsonResponse({ error: "empty_choice" }, 502);

    if (Array.isArray(choice.tool_calls) && choice.tool_calls.length > 0) {
      messages.push({ role: "assistant", content: choice.content ?? "", tool_calls: choice.tool_calls });
      for (const tc of choice.tool_calls) {
        const name = tc?.function?.name || "";
        let args: any = {};
        try { args = tc?.function?.arguments ? JSON.parse(tc.function.arguments) : {}; } catch { args = {}; }
        let result: unknown = { ok: true };

        if (name === "navigate_to_screen" && typeof args?.screen === "string") {
          clientNavigations.push(args.screen);
        } else if (name === "capture_signup_field" && typeof args?.field === "string" && typeof args?.value === "string") {
          formPatch[args.field] = String(args.value).slice(0, 200);
        } else if (name === "propose_write" && typeof args?.type === "string" && typeof args?.spoken_confirmation === "string") {
          pendingAction = { type: args.type, value: typeof args.value === "string" ? args.value : undefined, spoken_confirmation: args.spoken_confirmation };
        } else if (readTools[name]) {
          try { result = await readTools[name](); }
          catch (e) { result = { error: "tool_failed", message: String((e as Error)?.message ?? e) }; }
        } else {
          result = { error: "unknown_tool", name };
        }

        messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify(result).slice(0, 4000) });
      }
      continue;
    }

    assistantFinal = String(choice.content ?? "").trim();
    break;
  }

  if (!assistantFinal) assistantFinal = "I couldn't finish that. Please try again in a moment.";

  if (userId && conversationId) {
    await supabase.from("voice_messages").insert({
      conversation_id: conversationId, user_id: userId, role: "assistant",
      content: assistantFinal.slice(0, 4000), language,
    });
    await supabase.from("voice_conversations")
      .update({ turn_count: trimmed.filter((m: any) => m?.role === "user").length + 1, language })
      .eq("id", conversationId);
  }

  return jsonResponse({
    conversationId,
    reply: assistantFinal,
    navigate: clientNavigations,
    formPatch,
    pendingAction,
    language,
  });
});

