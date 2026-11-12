// STAGED ONLY: do not move into supabase/functions or deploy without separate approval.
import { createClient } from "npm:@supabase/supabase-js@2";
import { snapshot, slotAt, type Candidate, type Availability } from "./core.ts";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
const columns = "id,user_id,full_name,priority_score,rating,is_active,is_blocked,is_available,is_busy,communities,service_types,selected_community_id";
const pageAll = async <T>(read: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
  const result: T[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const { data, error } = await read(offset, offset + 499);
    if (error || !data) throw Error("read_failed");
    result.push(...data);
    if (data.length < 500) return result;
  }
  throw Error("incomplete_read"); // Never silently present the first 1000 as all workers.
};
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const verifier = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { auth: { persistSession: false } });
    // Verifies with Supabase Auth, not decode-only; never phone/fallback identity.
    const { data: verified, error: authError } = await verifier.auth.getUser(auth.slice(7));
    if (authError || !verified.user) return json({ error: "unauthorized" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const { data: linked, error: linkageError } = await admin.from("workers").select(columns).eq("user_id", verified.user.id).limit(2);
    if (linkageError) throw Error("read_failed");
    if (linked?.length !== 1) return json({ error: "identity_unverifiable" }, 403);
    const me = linked[0];
    const communities = Array.isArray(me.communities) ? me.communities.filter((s: unknown): s is string => typeof s === "string" && s.length > 0) : [];
    const services = Array.isArray(me.service_types) ? me.service_types.filter((s: string) => ["maid", "bathroom_cleaning"].includes(s)) : [];
    if (!communities.length || !services.length) return json({ error: "scope_unverifiable" }, 403);
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => !["community", "service"].includes(k))) return json({ error: "invalid_scope" }, 400);
    const community = body.community ?? communities[0], service = body.service ?? services[0];
    if (!communities.includes(community) || !services.includes(service)) return json({ error: "forbidden_scope" }, 403);
    const workers = await pageAll<Candidate>((start, end) => admin.from("workers").select(columns)
      .contains("communities", [community]).contains("service_types", [service]).order("id").range(start, end));
    const now = Date.now(), day = slotAt(now).day;
    const slots: Availability[] = [], busy = new Set<string>();
    const ids = Array.from(new Set([...workers.map(w => w.id), me.id]));
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      slots.push(...await pageAll<Availability>((start, end) => admin.from("worker_availability")
        .select("worker_id,day_of_week,slots").in("worker_id", chunk).eq("day_of_week", day).order("id").range(start, end)));
      const assigned = await pageAll<{ worker_id: string }>((start, end) => admin.from("bookings").select("worker_id")
        .in("worker_id", chunk).not("status", "in", "(completed,cancelled,rejected,failed,timeout)").order("id").range(start, end));
      assigned.forEach(b => busy.add(b.worker_id));
    }
    // A slot rollover during reads must retry, not publish old-day eligibility.
    if (slotAt(Date.now()).start !== slotAt(now).start || Date.now() - now > 10000) return json({ error: "retry" }, 503);
    return json(snapshot(me, workers, slots, busy, community, service, communities, services, now));
  } catch { return json({ error: "unable_to_verify" }, 503); }
});