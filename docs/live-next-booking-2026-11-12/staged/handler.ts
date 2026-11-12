import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { snapshot, slotAt, type Candidate, type Availability } from "./core.ts";

const headers = { ...corsHeaders, "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
const columns = "id,full_name,priority_score,rating,is_active,is_blocked,is_available,is_busy,communities,service_types";
const Body = z.object({ community: z.string().min(1).max(100).optional(), service: z.enum(["maid", "bathroom_cleaning"]).optional() }).strict();
const pageAll = async <T>(read: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
  const result: T[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const { data, error } = await read(offset, offset + 499);
    if (error || !data) throw Error("read_failed");
    result.push(...data);
    if (data.length < 500) return result;
  }
  throw Error("incomplete_read");
};
interface Dependencies {
  env: (name: string) => string | undefined;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}
export function createHandler(deps: Dependencies) {
  const clock = deps.now ?? Date.now;
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers });
    if (req.method !== "POST") return json({ error: "method" }, 405);
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ") || !auth.slice(7).trim()) return json({ error: "unauthorized" }, 401);
    // Bounded streaming parse; neither large JSON nor malformed inputs reach ranking reads.
    let parsed;
    try {
      const reader = req.body?.getReader();
      if (!reader) return json({ error: "invalid_scope" }, 400);
      const decoder = new TextDecoder(); let text = "", size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2048) { await reader.cancel(); return json({ error: "body_too_large" }, 413); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      parsed = Body.safeParse(JSON.parse(text));
      if (!parsed.success) return json({ error: "invalid_scope" }, 400);
    } catch { return json({ error: "invalid_scope" }, 400); }
    try {
      const url = deps.env("SUPABASE_URL"), anon = deps.env("SUPABASE_ANON_KEY"), serviceKey = deps.env("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !anon || !serviceKey) return json({ error: "configuration_unavailable" }, 503);
      const start = clock();
      const network: typeof globalThis.fetch = (input, init) => (deps.fetch ?? globalThis.fetch)(input, { ...init, signal: AbortSignal.timeout(8000) });
      const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: network } };
      const verifier = createClient(url, anon, options);
      // Auth server verifies the caller's actual session. No decode-only JWT or phone fallback.
      const { data: verified, error: authError } = await verifier.auth.getUser(auth.slice(7));
      if (authError || !verified.user || verified.user.role !== "authenticated" || verified.user.is_anonymous) return json({ error: "unauthorized" }, 401);
      const admin = createClient(url, serviceKey, options);
      const { data: linked, error: linkageError } = await admin.from("workers").select(columns).eq("user_id", verified.user.id).limit(2);
      if (linkageError) throw Error("read_failed");
      if (linked?.length !== 1) return json({ error: "identity_unverifiable" }, 403);
      const me = linked[0];
      const communities: string[] = Array.isArray(me.communities) ? [...new Set<string>(me.communities.filter((s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 100))] : [];
      const services: string[] = Array.isArray(me.service_types) ? [...new Set<string>(me.service_types.filter((s: string) => ["maid", "bathroom_cleaning"].includes(s)))] : [];
      if (!communities.length || communities.length > 100 || !services.length) return json({ error: "scope_unverifiable" }, 403);
      const community = parsed.data.community ?? communities[0], service = parsed.data.service ?? services[0];
      if (!communities.includes(community) || !services.includes(service)) return json({ error: "forbidden_scope" }, 403);
      const workers = await pageAll<Candidate>((a, b) => admin.from("workers").select(columns)
        .contains("communities", [community]).contains("service_types", [service]).order("id").range(a, b));
      const day = slotAt(start).day;
      const slots: Availability[] = [], busy = new Set<string>();
      const ids = Array.from(new Set([...workers.map(w => w.id), me.id]));
      for (let i = 0; i < ids.length; i += 100) {
        if (clock() - start > 8000) throw Error("slow_read");
        const chunk = ids.slice(i, i + 100);
        slots.push(...await pageAll<Availability>((a, b) => admin.from("worker_availability")
          .select("worker_id,day_of_week,slots").in("worker_id", chunk).eq("day_of_week", day).order("id").range(a, b)));
        // Assigned unknown and pending statuses are conservatively busy; NULL status also busy.
        const assigned = await pageAll<{ worker_id: string }>((a, b) => admin.from("bookings").select("worker_id")
          .in("worker_id", chunk).or("status.is.null,status.not.in.(completed,cancelled,rejected,failed,timeout)").order("id").range(a, b));
        assigned.forEach(b => busy.add(b.worker_id));
      }
      const end = clock();
      if (slotAt(end).start !== slotAt(start).start || end - start > 8000) return json({ error: "retry" }, 503);
      return json(snapshot(me, workers, slots, busy, community, service, communities, services, start));
    } catch { return json({ error: "unable_to_verify" }, 503); }
  };
}