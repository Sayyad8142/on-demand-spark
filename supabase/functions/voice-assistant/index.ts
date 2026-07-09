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

const SYSTEM_PROMPT = `You are "Didi", the personal voice assistant inside the Didi Now Partner worker app.
Workers are house-service professionals (maids, bathroom cleaners) in Indian gated communities. Many have low tech literacy.

RULES
- Reply in the SAME language the worker used (English, Hindi, or Telugu). Detect from their message.
- Be short, warm, and human. Prefer 1–3 short sentences. Never use markdown, lists, code, or emojis.
- Speak like a friendly trainer, never like a computer.
- Use ONLY facts returned by tools. Never invent numbers, dates, or booking counts. If a tool returns nothing, say so honestly.
- Currency amounts are in Indian Rupees. Say "rupees", not "INR" or "₹" (this is for TTS).
- For any question about the worker's own data (earnings, rating, priority score, bookings, availability, payments, notifications health) — call the matching tool FIRST, then answer.
- To open a screen, call navigate_to_screen. Do NOT describe navigation in words.
- Phase 1 is read-only: never claim you changed anything. If asked to change settings, say a tap-to-confirm update is coming and offer to open the relevant screen.
- Never reveal customer phone numbers or private details beyond what's already on the worker's screens.
- If unsure or STT confidence is low, ask a short clarifying question in the worker's language.`;

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_worker_profile",
      description: "Read the worker's own profile (name, services, community, online status, payout readiness).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_priority_score",
      description: "Read the worker's current Priority Score, tier, and recent reason.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_earnings_summary",
      description: "Sum the worker's earnings for today / this week / this month, plus pending and failed payout counts.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_bookings_summary",
      description: "Return counts of completed, cancelled, and active bookings for this worker in the last 30 days.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_ratings_summary",
      description: "Return the worker's average rating, total review count, and up to 3 latest reviews.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_availability",
      description: "Return the worker's availability slots grouped by day.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_health_status",
      description: "Return notification and FCM health flags for this worker (push token status, permissions).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "navigate_to_screen",
      description:
        "Open a screen in the app. Use this when the worker asks to open something. Returns after the navigation is issued.",
      parameters: {
        type: "object",
        properties: {
          screen: {
            type: "string",
            enum: [
              "home",
              "bookings",
              "availability",
              "profile",
              "earnings",
              "customer-reviews",
              "account-details",
              "settings",
              "contact-support",
              "troubleshoot",
            ],
          },
        },
        required: ["screen"],
        additionalProperties: false,
      },
    },
  },
];

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

  // Verify the caller. verify_jwt is disabled for edge fns in this project,
  // so we validate manually and refuse anonymous callers.
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return jsonResponse({ error: "missing_token" }, 401);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user) return jsonResponse({ error: "unauthorized" }, 401);
  const userId = userRes.user.id;

  let body: { messages?: unknown; conversationId?: unknown; language?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const inboundMessages = Array.isArray(body.messages) ? body.messages : [];
  if (inboundMessages.length === 0) return jsonResponse({ error: "missing_messages" }, 400);
  const language = typeof body.language === "string" ? body.language : "en";

  // Resolve worker row for this user (workers.user_id is text = uid).
  const { data: workerRow } = await supabase
    .from("workers")
    .select(
      "id, user_id, full_name, phone, services, community, is_available, priority_score, priority_score_reason, rating, total_reviews, upi_id, payout_ready, fcm_token, fcm_token_status, notification_permission_granted, overlay_permission_granted",
    )
    .or(`user_id.eq.${userId},id.eq.${userId}`)
    .maybeSingle();

  const workerId = workerRow?.id ?? null;

  // --- tool implementations (READ-ONLY) ---
  const tools: Record<string, () => Promise<unknown>> = {
    get_worker_profile: async () => {
      if (!workerRow) return { error: "no_worker_profile" };
      return {
        name: workerRow.full_name,
        services: workerRow.services,
        community: workerRow.community,
        is_online: workerRow.is_available,
        payout_ready: workerRow.payout_ready,
        upi_set: !!workerRow.upi_id,
      };
    },
    get_priority_score: async () => {
      if (!workerRow) return { error: "no_worker_profile" };
      const score = workerRow.priority_score ?? 50;
      return {
        score,
        tier: score >= 80 ? "top" : score >= 60 ? "mid" : "low",
        reason: workerRow.priority_score_reason || null,
      };
    },
    get_earnings_summary: async () => {
      if (!workerId) return { error: "no_worker_profile" };
      const now = new Date();
      const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
      const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const { data: payouts } = await supabase
        .from("worker_payouts")
        .select("payout_amount, status, created_at")
        .eq("worker_id", workerId)
        .gte("created_at", startOfMonth.toISOString())
        .limit(500);

      const rows = payouts || [];
      const sum = (from: Date) => rows
        .filter((r: any) => new Date(r.created_at) >= from && (r.status === "paid" || r.status === "processing" || r.status === "pending"))
        .reduce((a: number, r: any) => a + Number(r.payout_amount || 0), 0);

      return {
        today_rupees: Math.round(sum(startOfToday)),
        this_week_rupees: Math.round(sum(startOfWeek)),
        this_month_rupees: Math.round(sum(startOfMonth)),
        pending_count: rows.filter((r: any) => r.status === "pending" || r.status === "processing").length,
        failed_count: rows.filter((r: any) => r.status === "failed").length,
      };
    },
    get_bookings_summary: async () => {
      if (!workerId) return { error: "no_worker_profile" };
      const from = new Date(); from.setDate(from.getDate() - 30);
      const { data: bookings } = await supabase
        .from("bookings")
        .select("status")
        .eq("worker_id", workerId)
        .gte("created_at", from.toISOString())
        .limit(500);
      const rows = bookings || [];
      const count = (s: string) => rows.filter((r: any) => r.status === s).length;
      return {
        window_days: 30,
        completed: count("completed"),
        cancelled: count("cancelled"),
        active: rows.filter((r: any) => ["assigned", "accepted", "on_the_way", "started"].includes(r.status)).length,
        total: rows.length,
      };
    },
    get_ratings_summary: async () => {
      if (!workerId) return { error: "no_worker_profile" };
      const { data: ratings } = await supabase
        .from("worker_ratings")
        .select("rating, comment, created_at")
        .eq("worker_id", workerId)
        .order("created_at", { ascending: false })
        .limit(3);
      return {
        average: workerRow?.rating ?? null,
        total_reviews: workerRow?.total_reviews ?? 0,
        latest: (ratings || []).map((r: any) => ({
          rating: r.rating,
          comment: r.comment ? String(r.comment).slice(0, 120) : null,
          when: r.created_at,
        })),
      };
    },
    get_availability: async () => {
      if (!workerId) return { error: "no_worker_profile" };
      const { data } = await supabase
        .from("worker_availability")
        .select("day_of_week, slots")
        .eq("worker_id", workerId);
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      return {
        by_day: (data || []).map((r: any) => ({
          day: days[r.day_of_week] ?? r.day_of_week,
          slot_count: Array.isArray(r.slots) ? r.slots.length : 0,
        })),
      };
    },
    get_health_status: async () => {
      if (!workerRow) return { error: "no_worker_profile" };
      return {
        fcm_token_present: !!workerRow.fcm_token,
        fcm_token_status: workerRow.fcm_token_status || "unknown",
        notifications_allowed: workerRow.notification_permission_granted !== false,
        overlay_allowed: workerRow.overlay_permission_granted !== false,
      };
    },
    navigate_to_screen: async () => {
      // The client executes navigation from tool_calls; nothing to do server-side.
      return { acknowledged: true };
    },
  };

  // --- open / continue conversation record ---
  let conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
  if (!conversationId) {
    const { data } = await supabase
      .from("voice_conversations")
      .insert({ user_id: userId, worker_id: workerId, language })
      .select("id")
      .single();
    conversationId = data?.id ?? null;
  }
  // Log latest inbound user message.
  const lastUser = [...inboundMessages].reverse().find((m: any) => m?.role === "user");
  if (conversationId && lastUser?.content) {
    await supabase.from("voice_messages").insert({
      conversation_id: conversationId,
      user_id: userId,
      role: "user",
      content: String(lastUser.content).slice(0, 4000),
      language,
    });
  }

  // Truncate to last 20 turns to keep prompt small.
  const trimmed = inboundMessages.slice(-20);
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...trimmed as ChatMessage[],
  ];

  const clientNavigations: string[] = [];
  let assistantFinal = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const gwRes = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
      }),
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

    // If the model asked for tools, run them and loop.
    if (Array.isArray(choice.tool_calls) && choice.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: choice.content ?? "",
        tool_calls: choice.tool_calls,
      });
      for (const tc of choice.tool_calls) {
        const name = tc?.function?.name || "";
        let args: any = {};
        try { args = tc?.function?.arguments ? JSON.parse(tc.function.arguments) : {}; } catch { args = {}; }
        const fn = tools[name];
        let result: unknown;
        if (!fn) {
          result = { error: "unknown_tool", name };
        } else {
          try {
            result = await fn();
          } catch (e) {
            console.error(`[voice-assistant] tool ${name} failed`, e);
            result = { error: "tool_failed", message: String((e as Error)?.message ?? e) };
          }
        }
        if (name === "navigate_to_screen" && typeof args?.screen === "string") {
          clientNavigations.push(args.screen);
        }
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name,
          content: JSON.stringify(result).slice(0, 4000),
        });
      }
      continue;
    }

    assistantFinal = String(choice.content ?? "").trim();
    break;
  }

  if (!assistantFinal) {
    assistantFinal = "I couldn't finish that. Please try again in a moment.";
  }

  if (conversationId) {
    await supabase.from("voice_messages").insert({
      conversation_id: conversationId,
      user_id: userId,
      role: "assistant",
      content: assistantFinal.slice(0, 4000),
      language,
    });
    await supabase
      .from("voice_conversations")
      .update({ turn_count: trimmed.filter((m: any) => m?.role === "user").length + 1, language })
      .eq("id", conversationId);
  }

  return jsonResponse({
    conversationId,
    reply: assistantFinal,
    navigate: clientNavigations, // e.g. ["earnings"] — client will react-router push
    language,
  });
});
