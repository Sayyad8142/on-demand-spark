// Staged (NOT deployed). Resolve the calling worker from a verified Supabase login.
// WORKER_FN_AUTH_MODE: "compat" (default until the new Android release is widely installed)
//   - valid login  -> worker = workers.user_id = auth user id; a body id that differs -> 403
//   - no login     -> legacy body user_id accepted, logged as auth=legacy (old phones keep working)
// "strict" -> login required, legacy requests get 401.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type WorkerAuth =
  | { ok: true; worker: Record<string, unknown> & { id: string; user_id: string }; mode: "session" | "legacy" }
  | { ok: false; status: 401 | 403 | 404 | 500; error: string };

export async function resolveWorker(req: Request, admin: SupabaseClient, bodyUserId: unknown, columns: string): Promise<WorkerAuth> {
  const strict = (Deno.env.get("WORKER_FN_AUTH_MODE") ?? "compat") === "strict";
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const claimed = typeof bodyUserId === "string" ? bodyUserId.trim() : "";
  let userId = "";
  let mode: "session" | "legacy" = "session";
  if (token && token !== anon) {
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, anon, { global: { headers: { Authorization: auth } } });
    const { data, error } = await userClient.auth.getUser(token);
    if (error || !data?.user) return { ok: false, status: 401, error: "unauthorized" };
    userId = data.user.id;
    if (claimed && claimed !== userId) return { ok: false, status: 403, error: "forbidden" };
  } else if (!strict && claimed) {
    userId = claimed; mode = "legacy";
  } else {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  const { data: worker, error } = await admin.from("workers").select(`id, user_id, ${columns}`).eq("user_id", userId).maybeSingle();
  if (error) return { ok: false, status: 500, error: "lookup_failed" };
  if (!worker) return { ok: false, status: 404, error: "worker_not_found" };
  return { ok: true, worker: worker as never, mode };
}
