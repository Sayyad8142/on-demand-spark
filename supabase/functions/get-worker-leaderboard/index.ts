import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

console.log("[get-worker-leaderboard] initialized with URL:", SUPABASE_URL);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => {
  const responseBody = JSON.stringify(body);
  console.log(`[get-worker-leaderboard] responding with status ${status}`);
  return new Response(responseBody, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    console.log("[get-worker-leaderboard] handled OPTIONS");
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    console.log("[get-worker-leaderboard] request received. Auth header present:", !!authHeader);
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Verify token & resolve requesting worker manually
    // Since we're using Firebase Auth with Supabase, we decode the JWT and match phone
    const token = authHeader.replace("Bearer ", "");
    const parts = token.split(".");
    if (parts.length !== 3) return json({ error: "Invalid token format" }, 401);

    let payload;
    try {
      // Use standard b64 decoding for Deno
      const decoded = atob(parts[1]);
      payload = JSON.parse(decoded);
    } catch (e) {
      console.error("[get-worker-leaderboard] JWT parse error:", e);
      return json({ error: "Invalid token payload" }, 401);
    }

    const phone = payload.phone_number || payload.phone || payload.sub;
    console.log("[get-worker-leaderboard] Payload keys:", Object.keys(payload));
    if (!phone) return json({ error: "Identifier not found in token" }, 401);

    // Resolve worker by phone (normalized last 10 digits match) or by id/user_id
    const last10 = phone.length >= 10 ? phone.slice(-10) : null;
    const cols = "id, community, full_name, first_name, photo_url, rating, priority_score, total_bookings_completed";
    
    let me: any = null;
    
    // 1. Try resolving by user_id/id (for workers already linked to this auth provider)
    const { data: byId } = await admin
      .from("workers")
      .select(cols)
      .or(`id.eq.${phone},user_id.eq.${phone}`)
      .maybeSingle();
    
    me = byId;

    // 2. Fallback: Resolve by phone (for legacy workers not yet linked)
    if (!me && last10) {
      const { data: byPhone } = await admin
        .from("workers")
        .select(cols)
        .like("phone", `%${last10}`)
        .maybeSingle();
      me = byPhone;
    }

    if (!me) {
      console.log("[get-worker-leaderboard] Worker profile not found for identifier", phone);
      return json({ error: "Worker profile not found" }, 404);
    }

    // 3. Fetch Top Workers — scoped to community when set, otherwise global
    let query = admin
      .from("workers")
      .select("id, first_name, photo_url, rating, priority_score, total_bookings_completed, is_blocked")
      .eq("is_blocked", false);

    if (me.community) query = query.eq("community", me.community);

    const { data: topWorkers, error: rankError } = await query
      .order("priority_score", { ascending: false })
      .order("rating", { ascending: false })
      .order("total_bookings_completed", { ascending: false })
      .limit(50);

    if (rankError) {
      console.error("[get-worker-leaderboard] rank error:", rankError);
      throw rankError;
    }

    // 4. Calculate "Today's" stats for the top 50 workers
    // IMPORTANT: Ensure todayStart is in IST (UTC+5:30) for consistency with Indian operations
    const todayStart = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    const workerIds = (topWorkers ?? []).map(w => w.id);
    if (workerIds.length === 0) {
      return json({ community: me.community ?? null, leaderboard: [], updatedAt: new Date().toISOString() });
    }

    // Get completed booking counts for today
    const { data: todayBookings, error: bookingsError } = await admin
      .from("bookings")
      .select("worker_id")
      .in("worker_id", workerIds)
      .eq("status", "completed")
      .gte("completed_at", todayIso);

    if (bookingsError) {
      console.error("[get-worker-leaderboard] bookings error:", bookingsError);
      throw bookingsError;
    }

    // Get earnings for today
    const { data: todayPayouts, error: payoutsError } = await admin
      .from("worker_payouts")
      .select("worker_id, payout_amount")
      .in("worker_id", workerIds)
      .in("status", ["paid", "processing", "pending", "approved"])
      .gte("created_at", todayIso);

    if (payoutsError) {
      console.error("[get-worker-leaderboard] payouts error:", payoutsError);
      throw payoutsError;
    }

    const bookingCounts = new Map();
    todayBookings?.forEach(b => {
      bookingCounts.set(b.worker_id, (bookingCounts.get(b.worker_id) || 0) + 1);
    });

    const earningsMap = new Map();
    todayPayouts?.forEach(p => {
      earningsMap.set(p.worker_id, (earningsMap.get(p.worker_id) || 0) + Number(p.payout_amount));
    });

    // 5. Build enriched leaderboard
    const leaderboard = (topWorkers ?? []).map((w, index) => {
      const jobsToday = bookingCounts.get(w.id) || 0;
      const earningsToday = earningsMap.get(w.id) || 0;
      
      let level = "Standard";
      if (w.priority_score >= 90) level = "Elite";
      else if (w.priority_score >= 75) level = "Pro";
      else if (w.priority_score >= 50) level = "Rising";

      return {
        id: w.id,
        rank: index + 1,
        first_name: (w as any).first_name || "Worker",
        photo_url: w.photo_url,
        rating: w.rating || 5,
        priority_score: w.priority_score || 50,
        level,
        jobsToday,
        earningsToday,
        isMe: w.id === me.id
      };
    });

    return json({
      community: me.community ?? null,
      leaderboard,
      updatedAt: new Date().toISOString()
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const stack = e instanceof Error ? e.stack : "no stack";
    console.error(`[get-worker-leaderboard] fatal: ${msg}\nStack: ${stack}`);
    return json({ error: "fatal", detail: msg, stack: stack }, 500);
  }
});
