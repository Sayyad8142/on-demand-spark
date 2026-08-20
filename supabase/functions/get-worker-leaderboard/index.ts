import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Verify Firebase token
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // 2. Resolve requesting worker (user_id = uid OR id = uid)
    const cols = "id, community, full_name, photo_url, rating, priority_score, total_bookings_completed";
    let me: any = null;
    const { data: byUserId } = await admin.from("workers").select(cols).eq("user_id", user.id).maybeSingle();
    me = byUserId;
    if (!me) {
      const { data: byId } = await admin.from("workers").select(cols).eq("id", user.id).maybeSingle();
      me = byId;
    }

    if (!me) return json({ error: "Worker profile not found" }, 404);

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
    const todayStart = new Date();
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
