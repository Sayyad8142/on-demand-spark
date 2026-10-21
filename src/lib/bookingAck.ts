/**
 * Booking delivery ACK helper.
 *
 * Fire-and-forget calls to the `ack-booking-delivery` edge function so the
 * server can record exactly when each alert reached the worker:
 *
 *   - push_received: the FCM data payload arrived on this device
 *   - popup_shown:   the booking popup actually rendered on screen
 *   - worker_seen:   the worker visibly opened/saw the booking card
 *
 * Idempotent on both sides: the server only writes the timestamp the first
 * time, and we cache acked (booking_id + event) pairs in memory to avoid
 * spamming the network.
 *
 * Phase 1C — signed acknowledgment tokens:
 * The backend (Admin Panel `docs/ack-fix/phase1b`) mints a short-lived,
 * offer-bound HMAC token per push and puts it in the FCM data payload as
 * `ack_token`. The Worker App echoes the token UNCHANGED back to
 * ack-booking-delivery so background / expired-session devices can prove
 * delivery without a live Supabase session. Rules enforced here:
 *   - the token is never generated or modified on the client,
 *   - the token is never logged or sent to analytics,
 *   - HTTP 400/401/403 responses are never treated as a successful ACK.
 */

import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { CURRENT_VERSION_NAME } from "@/config/version";


export type AckEvent =
  | "push_received"
  | "popup_shown"
  | "worker_seen"
  // Worker interactions — logged only, never change dispatch/assignment.
  | "accept_tapped"
  | "reject_tapped"
  | "offer_expired"
  | "offer_dismissed";

const appState = () =>
  typeof document !== "undefined" ? (document.visibilityState === "visible" ? "foreground" : "background") : "unknown";

const acked = new Set<string>();
const key = (id: string, ev: AckEvent) => `${id}::${ev}`;
const WORKER_ID_CACHE_KEY = "didi_worker_id";
let cachedWorkerId: string | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Signed ACK token handling (Phase 1C)
// ─────────────────────────────────────────────────────────────────────────────

/** Backend contract: the FCM data key is `ack_token` (Admin Panel phase1b). */
export const ACK_TOKEN_PAYLOAD_KEY = "ack_token";
/** Body key the ack-booking-delivery edge function reads. */
export const ACK_TOKEN_BODY_KEY = "ack_token";
/** Defensive cap — the backend rejects tokens longer than 2048 chars. */
export const ACK_TOKEN_MAX_LEN = 2048;

/** Returns the token only if it looks intact; never trims/re-encodes the value. */
export function normalizeAckToken(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.length > ACK_TOKEN_MAX_LEN) return null;
  return t;
}

/** Extracts `ack_token` (plus the camelCase alias) from an FCM data payload. */
export function extractAckToken(data: Record<string, unknown> | undefined | null): string | null {
  if (!data) return null;
  return normalizeAckToken(data[ACK_TOKEN_PAYLOAD_KEY]) ?? normalizeAckToken((data as any).ackToken);
}

// Token registry. Exact offers are keyed by booking_request_id (preferred).
// Callers that only know a booking id (Accept/Reject/worker_seen) go through a
// single alias that points at the CURRENT offer for that booking; a newer offer
// replaces it and clearing an offer removes it. Memory-only; never logged.
interface RememberedToken {
  bookingId?: string;
  bookingRequestId?: string;
  token: string;
  rememberedAt: number;
}
const rememberedTokens = new Map<string, RememberedToken>(); // exact key -> entry
const bookingAlias = new Map<string, string>(); // booking id -> exact key of current offer
const MAX_REMEMBERED_TOKENS = 40;
const REMEMBERED_TOKEN_TTL_MS = 30 * 60 * 1000;

const tokenKeyOf = (bookingId?: string, bookingRequestId?: string) =>
  bookingRequestId ? `r:${bookingRequestId}` : bookingId ? `b:${bookingId}` : "";

/** Client-only expiry read (epoch ms) used to stop retries/reuse; server stays authoritative. */
export function ackTokenExpiryMs(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const exp = Number(JSON.parse(atob(b64 + "===".slice((b64.length + 3) % 4))).exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
  } catch { return null; }
}

function isUsable(e: RememberedToken, now = Date.now()) {
  if (now - e.rememberedAt > REMEMBERED_TOKEN_TTL_MS) return false;
  const exp = ackTokenExpiryMs(e.token);
  return exp == null || now < exp;
}

/** Stores the signed token an FCM push carried, keyed by offer id. */
export function rememberAckToken(args: { bookingId?: string; bookingRequestId?: string; ackToken?: string | null }) {
  const token = normalizeAckToken(args.ackToken);
  if (!token) return;
  const k = tokenKeyOf(args.bookingId, args.bookingRequestId);
  if (!k) return;
  if (rememberedTokens.size >= MAX_REMEMBERED_TOKENS) {
    const oldest = rememberedTokens.keys().next().value;
    if (oldest) rememberedTokens.delete(oldest);
  }
  rememberedTokens.set(k, { bookingId: args.bookingId, bookingRequestId: args.bookingRequestId, token, rememberedAt: Date.now() });
  if (args.bookingId) bookingAlias.set(args.bookingId, k); // newest offer wins
}

/** Removes an offer's token and any alias pointing at it (offer cleared/reassigned). */
export function forgetAckToken(bookingId?: string, bookingRequestId?: string) {
  const k = bookingRequestId ? tokenKeyOf(undefined, bookingRequestId) : bookingId ? bookingAlias.get(bookingId) : undefined;
  if (k) rememberedTokens.delete(k);
  if (bookingId) {
    const aliased = bookingAlias.get(bookingId);
    if (!bookingRequestId || aliased === k) {
      if (aliased) rememberedTokens.delete(aliased);
      bookingAlias.delete(bookingId);
    }
  }
}

/** Looks up a token: exact request id first; booking-id alias only when no request id is given. */
export function recallAckToken(bookingId?: string, bookingRequestId?: string): string | null {
  const k = bookingRequestId
    ? tokenKeyOf(undefined, bookingRequestId)
    : bookingId ? (bookingAlias.get(bookingId) ?? tokenKeyOf(bookingId)) : "";
  if (!k) return null;
  const hit = rememberedTokens.get(k);
  if (!hit) return null;
  // A request id that belongs to a different booking never resolves.
  if (bookingId && hit.bookingId && hit.bookingId !== bookingId) return null;
  if (!isUsable(hit)) {
    rememberedTokens.delete(k);
    return null;
  }
  return hit.token;
}

/**
 * Pure body builder for the ack-booking-delivery edge function.
 * Exposed for offline contract tests against the backend reference handler.
 */
export function buildAckBody(args: {
  bookingId?: string;
  bookingRequestId?: string;
  workerId?: string | null;
  event: AckEvent;
  appState?: string;
  appVersion?: string;
  ackToken?: string | null;
  deviceInfo?: Record<string, unknown>;
}): Record<string, unknown> {
  const token = normalizeAckToken(args.ackToken);
  return {
    booking_id: args.bookingId,
    booking_request_id: args.bookingRequestId,
    ...(args.workerId ? { worker_id: args.workerId } : {}),
    event_type: args.event,
    app_state: args.appState ?? appState(),
    app_version: args.appVersion ?? CURRENT_VERSION_NAME,
    ...(token ? { [ACK_TOKEN_BODY_KEY]: token } : {}),
    device_info: args.deviceInfo ?? {
      platform: Capacitor.getPlatform(),
      native: Capacitor.isNativePlatform(),
      source: "webview",
    },
  };
}

/**
 * Legacy receiver compatibility. The ack-booking-delivery build live in
 * production (probed 2026-10-21) only accepts event_type "received" |
 * "opened" and requires booking_id + worker_id; every current event name is
 * answered with 400, so no device confirmation has been recorded since
 * 2026-10-14. Only the three delivery events have a legacy meaning;
 * interaction events (accept/reject taps, expiry) have none and are never
 * re-sent. The newer receiver maps these aliases too.
 */
export const LEGACY_ACK_EVENT: Partial<Record<string, "received" | "opened">> = {
  push_received: "received",
  popup_shown: "opened",
  worker_seen: "opened",
};

export function buildLegacyAckBody(args: {
  bookingId?: string;
  workerId?: string | null;
  event: string;
  appVersion?: string;
}): Record<string, unknown> | null {
  const legacy = LEGACY_ACK_EVENT[args.event];
  if (!legacy || !args.bookingId || !args.workerId) return null;
  return {
    booking_id: args.bookingId,
    worker_id: args.workerId,
    event_type: legacy,
    app_version: args.appVersion ?? CURRENT_VERSION_NAME,
  };
}

/** HTTP status from a supabase-js FunctionsHttpError, if present. */
export function ackErrorStatus(error: unknown): number | null {
  const s = (error as any)?.context?.status;
  return typeof s === "number" ? s : null;
}

async function getWorkerId(): Promise<string | null> {
  if (cachedWorkerId) return cachedWorkerId;

  try {
    const stored = localStorage.getItem(WORKER_ID_CACHE_KEY);
    if (stored) {
      cachedWorkerId = stored;
      return stored;
    }
  } catch { /* storage unavailable */ }

  // getSession() reads local storage (works offline / expired-network paths);
  // getUser() is only a fallback because it needs a live network call.
  let uid: string | undefined;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    uid = session?.user?.id;
    if (!uid) {
      const { data: { user } } = await supabase.auth.getUser();
      uid = user?.id;
    }
  } catch { /* ignore */ }

  if (!uid) return null;

  // Worker ID resolution pattern: user_id = uid OR id = uid
  const { data: worker, error: workerError } = await supabase
    .from("workers")
    .select("id")
    .or(`user_id.eq.${uid},id.eq.${uid}`)
    .maybeSingle();

  if (workerError || !worker?.id) {
    console.warn("[ACK] worker_id lookup failed", workerError?.message);
    return null;
  }

  cachedWorkerId = worker.id;
  try { localStorage.setItem(WORKER_ID_CACHE_KEY, worker.id); } catch { /* ignore */ }
  return cachedWorkerId;
}



interface AckArgs {
  bookingId?: string;
  bookingRequestId?: string;
  event: AckEvent;
  /** Signed acknowledgment token from the FCM payload — echoed unchanged. */
  ackToken?: string | null;
}

export async function ackBookingDelivery({ bookingId, bookingRequestId, event, ackToken }: AckArgs): Promise<void> {
  const cacheKey = key(bookingRequestId ?? bookingId ?? "?", event);
  if (acked.has(cacheKey)) return;
  acked.add(cacheKey);

  if (!bookingId && !bookingRequestId) return;

  try {
    // worker_id is best-effort: if it cannot be resolved locally we still send
    // the ACK, and the edge function falls back to JWT-based resolution (or
    // authenticates via the signed ack_token, which needs no session at all).
    const workerId = await getWorkerId();
    if (!workerId) {
      console.warn(`[ACK] ${event}: worker_id unresolved locally, sending JWT-only ACK`);
    }

    // Explicit token wins; otherwise reuse the token the FCM push carried.
    const token = normalizeAckToken(ackToken) ?? recallAckToken(bookingId, bookingRequestId);

    const body = buildAckBody({ bookingId, bookingRequestId, workerId, event, ackToken: token });

    const { data, error } = await supabase.functions.invoke("ack-booking-delivery", { body });

    if (error) {
      // Legacy receiver: a 400 on a delivery event is retried ONCE with the
      // legacy event name. A 2xx there counts; anything else is not success.
      const legacyBody = ackErrorStatus(error) === 400
        ? buildLegacyAckBody({ bookingId, workerId, event })
        : null;
      if (legacyBody) {
        const legacy = await supabase.functions.invoke("ack-booking-delivery", { body: legacyBody });
        if (!legacy.error) {
          console.log(`[ACK] ${event} ok (legacy receiver)`);
          return;
        }
      }
      // 400/401/403 (bad event, invalid/expired/mismatched token, wrong
      // worker) are NOT successful acknowledgments — log the outcome, keep
      // the token out of the message, and allow a later lifecycle event to
      // retry with fresh state.
      console.warn(`[ACK] ${event} failed`, error.message);
      acked.delete(cacheKey);
      return;
    }
    // 200 + skipped/request_not_found is terminal but NOT proof of delivery.
    const skipped = (data as any)?.skipped === true || (data as any)?.reason === "request_not_found";
    console.log(`[ACK] ${event} ${skipped ? "skipped (not recorded)" : "ok"}`);
  } catch (e) {
    console.warn(`[ACK] ${event} threw`, e);
    acked.delete(cacheKey);
  }
}

/** Reset the in-memory cache (e.g. on logout or test) */
export function resetAckCache() {
  acked.clear();
  rememberedTokens.clear();
  bookingAlias.clear();
  cachedWorkerId = null;
  try { localStorage.removeItem(WORKER_ID_CACHE_KEY); } catch { /* ignore */ }
}
