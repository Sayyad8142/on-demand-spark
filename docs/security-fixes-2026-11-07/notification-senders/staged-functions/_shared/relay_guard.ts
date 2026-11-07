// STAGED — NOT DEPLOYED. Runtime wrapper for the four forwarding functions.
// Same switch as send-fcm: NOTIFY_AUTH_MODE unset/"observe" = log only, "enforce" = refuse.
import { createClient } from "npm:@supabase/supabase-js@2";
import { internalKeyMatches, type VerifiedCaller } from "./notify_auth.ts";
import { decideRelayAccess, type Relay } from "./relay_auth.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function resolveCaller(req: Request): Promise<VerifiedCaller | null> {
  const internalKeyValid = internalKeyMatches(req.headers.get("x-internal-key"), Deno.env.get("DISPATCH_INTERNAL_KEY"));
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const base: VerifiedCaller = { role: null, userId: null, isAdmin: false, ownWorkerIds: [], internalKeyValid };
  if (SERVICE && token && internalKeyMatches(token, SERVICE)) return { ...base, role: "service_role" };
  if (!token) return internalKeyValid ? base : null;
  try {
    const c = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
    const { data, error } = await c.auth.getClaims(token);
    if (error || !data?.claims) return internalKeyValid ? base : null;
    const role = String(data.claims.role ?? "");
    const isAdmin = role === "authenticated" ? (await c.rpc("is_admin")).data === true : false;
    return { ...base, role, userId: data.claims.sub ? String(data.claims.sub) : null, isAdmin };
  } catch {
    return internalKeyValid ? base : null;
  }
}

/** Server re-read: booking still pending + a rejection in the last 5 min. Body is never trusted beyond the id. */
export async function verifyRedispatch(bookingId: unknown): Promise<boolean> {
  if (typeof bookingId !== "string" || !/^[0-9a-f-]{36}$/i.test(bookingId)) return false;
  const svc = createClient(URL_, SERVICE);
  const { data: b } = await svc.from("bookings").select("status, worker_id").eq("id", bookingId).maybeSingle();
  if (!b || b.status !== "pending" || b.worker_id) return false;
  const since = new Date(Date.now() - 5 * 60_000).toISOString();
  const { count } = await svc.from("booking_requests").select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId).eq("status", "rejected").gte("responded_at", since);
  return (count ?? 0) > 0;
}

/** Returns a Response when blocked, else null. Logs one line per call, never tokens. */
export async function guardRelay(req: Request, relay: Relay, cors: Record<string, string>, bookingId?: unknown): Promise<Response | null> {
  const caller = await resolveCaller(req);
  const redispatchVerified = relay === "notify-next-tier" && caller?.role !== "service_role" && !caller?.internalKeyValid
    ? await verifyRedispatch(bookingId) : undefined;
  const d = decideRelayAccess(relay, caller, { redispatchVerified });
  const mode = Deno.env.get("NOTIFY_AUTH_MODE") === "enforce" ? "enforce" : "observe";
  console.log(JSON.stringify({ evt: "relay_auth", fn: relay, mode, allow: d.allow, reason: d.reason }));
  if (d.allow || mode !== "enforce") {
    if (!d.allow) console.warn(`notify_auth_observe_refuse:${d.reason}`);
    return null;
  }
  console.warn(`notify_auth_enforce_refuse:${d.reason}`);
  return new Response(JSON.stringify({ error: d.status === 401 ? "Unauthorized" : "Forbidden" }), { status: d.status, headers: { ...cors, "Content-Type": "application/json" } });
}
