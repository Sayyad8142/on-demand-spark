// report-worker-diagnostics — STAGED ONLY. Do NOT copy under supabase/functions
// until approved (saving there auto-deploys to production).
//
// Pure handler (no runtime imports) so it is testable offline. Writes ONLY to
// worker_diagnostic_events / worker_diagnostic_status. It never touches
// workers.is_available, dispatch, ranking, bookings, payments or payouts.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export const KINDS = new Set([
  "snapshot", "network_lost", "network_restored", "explicit_logout",
  "push_registration_failed", "push_token_refreshed", "notification_permission",
]);
export const MAX_EVENTS = 50;
const FORBIDDEN_KEY = /token|secret|password|jwt|authorization|session/i;
const FUTURE_MS = 5 * 60_000;
const PAST_MS = 7 * 24 * 3600_000;
const SNAPSHOT_FIELDS = ["network", "notification_permission", "token_registered", "slot_state", "app_version", "session_state"] as const;

// deno-lint-ignore no-explicit-any
type Client = any;
export interface Deps {
  admin: () => Client;
  /** Verifies a Firebase ID token; returns the uid or null. Never logs the token. */
  verifyFirebaseToken: (token: string) => Promise<string | null>;
  now?: () => number;
}

export interface IncomingEvent { id: string; kind: string; observed_at: string; data?: Record<string, unknown> }

/** Validates one event; returns a reason string when rejected. */
export function validateEvent(e: unknown, now: number): string | null {
  if (!e || typeof e !== "object") return "not_object";
  const ev = e as IncomingEvent;
  if (typeof ev.id !== "string" || ev.id.length < 1 || ev.id.length > 200) return "bad_id";
  if (!KINDS.has(ev.kind)) return "bad_kind";
  const t = Date.parse(ev.observed_at);
  if (!Number.isFinite(t)) return "bad_time";
  if (t > now + FUTURE_MS || t < now - PAST_MS) return "time_out_of_range";
  const data = ev.data ?? {};
  if (typeof data !== "object" || Array.isArray(data)) return "bad_data";
  for (const [k, v] of Object.entries(data)) {
    if (FORBIDDEN_KEY.test(k) && typeof v === "string") return "forbidden_key";
    if (v !== null && !["string", "number", "boolean"].includes(typeof v)) return "bad_value";
    if (typeof v === "string" && v.length > 200) return "value_too_long";
  }
  return null;
}

export function makeHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const now = deps.now?.() ?? Date.now();
    try {
      const auth = req.headers.get("Authorization") ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!token) return json({ error: "unauthorized" }, 401);
      const uid = await deps.verifyFirebaseToken(token).catch(() => null);
      if (!uid) return json({ error: "unauthorized" }, 401);

      const body = await req.json().catch(() => null) as { events?: unknown } | null;
      if (!body || !Array.isArray(body.events)) return json({ error: "events_required" }, 400);
      if (body.events.length === 0) return json({ acceptedIds: [], rejected: [] });
      if (body.events.length > MAX_EVENTS) return json({ error: "too_many_events" }, 400);

      const admin = deps.admin();
      // Worker resolved from the verified session only; any client worker_id is ignored.
      const { data: w } = await admin.from("workers").select("id").eq("user_id", uid).maybeSingle();
      if (!w?.id) return json({ error: "worker_not_found" }, 403);
      const workerId: string = w.id;

      const valid: IncomingEvent[] = [];
      const rejected: { id: unknown; reason: string }[] = [];
      const seen = new Set<string>();
      for (const e of body.events) {
        const reason = validateEvent(e, now);
        if (reason) { rejected.push({ id: (e as any)?.id ?? null, reason }); continue; }
        const ev = e as IncomingEvent;
        if (seen.has(ev.id)) continue;
        seen.add(ev.id);
        valid.push(ev);
      }

      if (valid.length) {
        const rows = valid.map((e) => ({
          worker_id: workerId, event_id: e.id, kind: e.kind,
          observed_at: new Date(e.observed_at).toISOString(), data: e.data ?? {},
        }));
        // Duplicates are ignored, never overwritten.
        const { error } = await admin.from("worker_diagnostic_events")
          .upsert(rows, { onConflict: "worker_id,event_id", ignoreDuplicates: true });
        if (error) return json({ error: "store_failed" }, 500);

        // Newest snapshot/logout updates status; the RPC applies newer-wins atomically.
        const latest = valid.filter((e) => e.kind === "snapshot" || e.kind === "explicit_logout")
          .sort((a, b) => a.observed_at.localeCompare(b.observed_at)).pop();
        if (latest) {
          const d = latest.data ?? {};
          const patch: Record<string, unknown> = {};
          for (const f of SNAPSHOT_FIELDS) if (f in d) patch[f] = d[f];
          const { error: sErr } = await admin.rpc("upsert_worker_diagnostic_status", {
            p_worker_id: workerId,
            p_observed_at: new Date(latest.observed_at).toISOString(),
            p_fields: patch,
            p_logout: latest.kind === "explicit_logout",
          });
          if (sErr) return json({ error: "status_failed", acceptedIds: valid.map((e) => e.id) }, 500);
        }
      }
      return json({ acceptedIds: valid.map((e) => e.id), rejected });
    } catch {
      return json({ error: "internal" }, 500);
    }
  };
}
