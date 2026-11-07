// STAGED — NOT DEPLOYED. Shared caller check for send-fcm / send-webpush.
// NOTIFY_AUTH_MODE: "observe" (default, never blocks, logs) | "enforce".
import { createClient } from "npm:@supabase/supabase-js@2";
import { applyMode, decideNotifyAccess, internalKeyMatches, type VerifiedCaller } from "./notify_auth.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function resolveCaller(req: Request): Promise<VerifiedCaller | null> {
  const internalKeyValid = internalKeyMatches(req.headers.get("x-internal-key"), Deno.env.get("DISPATCH_INTERNAL_KEY"));
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const base: VerifiedCaller = { role: null, userId: null, isAdmin: false, ownWorkerIds: [], internalKeyValid };
  if (!token) return internalKeyValid ? base : null;
  if (SERVICE && internalKeyMatches(token, SERVICE)) return { ...base, role: "service_role" };
  try {
    const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
    const { data, error } = await userClient.auth.getClaims(token);
    if (error || !data?.claims) return internalKeyValid ? base : null;
    const role = String(data.claims.role ?? "");
    const sub = data.claims.sub ? String(data.claims.sub) : null;
    if (role !== "authenticated" || !sub) return { ...base, role, userId: sub };
    const { data: isAdmin } = await userClient.rpc("is_admin");
    const svc = createClient(URL_, SERVICE);
    const { data: ws } = await svc.from("workers").select("id").or(`user_id.eq.${sub},id.eq.${sub}`);
    return { ...base, role, userId: sub, isAdmin: isAdmin === true, ownWorkerIds: (ws ?? []).map((w: { id: string }) => w.id) };
  } catch {
    return internalKeyValid ? base : null;
  }
}

/** Returns a Response to send back when blocked, or null to continue. Never logs tokens. */
export async function guardNotify(req: Request, payload: { workerIds?: unknown; data?: { type?: unknown }; type?: unknown }, cors: Record<string, string>, fn: string): Promise<Response | null> {
  const caller = await resolveCaller(req);
  const workerIds = Array.isArray(payload.workerIds) ? payload.workerIds.map(String) : [];
  const type = String(payload.data?.type ?? payload.type ?? "");
  const decision = decideNotifyAccess(caller, { workerIds, type });
  const mode = Deno.env.get("NOTIFY_AUTH_MODE") === "enforce" ? "enforce" : "observe";
  const { block, log } = applyMode(decision, mode);
  console.log(JSON.stringify({ evt: "notify_auth", fn, mode, allow: decision.allow, reason: decision.reason, type, n: workerIds.length }));
  if (log) console.warn(log);
  if (!block || decision.allow) return null;
  return new Response(JSON.stringify({ error: decision.status === 401 ? "Unauthorized" : "Forbidden" }), { status: decision.status, headers: { ...cors, "Content-Type": "application/json" } });
}
