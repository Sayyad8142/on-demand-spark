import { supabase } from "@/integrations/supabase/client";

/**
 * OTP V2 gateway client (two-stage OTP: Start OTP + Completion OTP).
 *
 * Contract (final backend contract):
 *   POST /functions/v1/otp-v2-gateway
 *   { action: "resolve_mode" | "verify_start" | "verify_completion", booking_id, otp? }
 *   HTTP 200 may still carry { success: false, error_code } — always checked.
 *   → { success: true, status: "started" | "completed", idempotent: boolean }
 *   → errors: INVALID_REQUEST, UNAUTHORIZED, BOOKING_NOT_FOUND, LEGACY_BOOKING,
 *     NOT_CURRENT_ASSIGNMENT, TERMINAL_BOOKING, CREDENTIAL_INVALID, INVALID_STATUS,
 *     START_NOT_VERIFIED, INCORRECT_OTP, LOCKED, LIFETIME_LOCKED,
 *     OTP_V2_UNAVAILABLE, OTP_V2_OPERATION_FAILED
 *
 * Proposed (NOT in the contract yet — see docs/otp-v2-resolve-mode-contract.md):
 *   { action: "resolve_mode", booking_id }
 *   → { success: true, booking_id, otp_mode: "v2" | "legacy", assignment_generation, start_verified }
 *   Until the backend implements it, every booking resolves to "unavailable"
 *   and the job card shows a safe, non-actionable state (V2 client mode only).
 *
 * Security rules honored here:
 * - OTP values are NEVER logged or persisted.
 * - Only the worker's current Supabase session token is sent (supabase-js
 *   attaches it as `Authorization: Bearer`). No Firebase token, no worker id.
 * - Duplicate submissions share one in-flight request.
 * - Only an explicit LEGACY_BOOKING answer from the gateway, in the same
 *   submission, may lead to the legacy completion path. The mode cache below
 *   is display-only and is never used to authorize anything.
 */

// ── Rollout switch ───────────────────────────────────────────────────
// OFF: the app behaves exactly like the pre-V2 release (legacy lifecycle,
// legacy completion function, no gateway calls) — identical to older
// installed app versions, so turning it off adds no new exposure.
// ON: two-stage V2 flow with strict mode resolution.
// Isolated integration testing can opt in per device with
// localStorage.setItem("otp_v2_client", "1"). Enabling only makes the
// client stricter; enforcement always belongs to the backend.
export const OTP_V2_CLIENT_ENABLED_DEFAULT = false;

export function isOtpV2ClientEnabled(): boolean {
  try {
    const override = localStorage.getItem("otp_v2_client");
    if (override === "1") return true;
    if (override === "0") return false;
  } catch {
    // storage unavailable
  }
  return OTP_V2_CLIENT_ENABLED_DEFAULT;
}

export type OtpV2Action = "verify_start" | "verify_completion";

export type OtpV2ErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "BOOKING_NOT_FOUND"
  | "LEGACY_BOOKING"
  | "NOT_CURRENT_ASSIGNMENT"
  | "TERMINAL_BOOKING"
  | "CREDENTIAL_INVALID"
  | "INVALID_STATUS"
  | "START_NOT_VERIFIED"
  | "INCORRECT_OTP"
  | "LOCKED"
  | "LIFETIME_LOCKED"
  | "OTP_V2_UNAVAILABLE"
  | "OTP_V2_OPERATION_FAILED"
  | "NETWORK"
  | "TIMEOUT";

export type OtpV2Success = { ok: true; status: "started" | "completed"; idempotent: boolean };
/** Server-supplied limits shown to the worker (never authorize anything). */
export type OtpV2Limits = {
  remainingAttempts?: number;
  /** From LOCKED `locked_until` (ISO). The backend has no time-based OTP expiry. */
  lockedUntil?: string;
  retryAfterSeconds?: number;
};
export type OtpV2Failure = { ok: false; code: OtpV2ErrorCode; message: string; limits?: OtpV2Limits };

/** V2 Start and Completion OTPs are four digits: the live otp-v2-gateway only accepts /^\d{4}$/ (verified 2026-10-26). Legacy completion is also four. */
export const V2_OTP_LENGTH = 4;
export const LEGACY_OTP_LENGTH = 4;

/** Read remaining attempts / lock end from a gateway body (no expiry: backend has none). */
export function parseOtpLimits(body: Record<string, unknown> | null | undefined, now: number = Date.now()): OtpV2Limits | undefined {
  if (!body) return undefined;
  const out: OtpV2Limits = {};
  const ra = body.remaining_attempts ?? body.attempts_remaining;
  if (typeof ra === "number" && Number.isInteger(ra) && ra >= 0) out.remainingAttempts = ra;
  if (typeof body.locked_until === "string" && !Number.isNaN(Date.parse(body.locked_until))) {
    out.lockedUntil = body.locked_until;
    const secs = Math.ceil((Date.parse(body.locked_until) - now) / 1000);
    if (secs > 0) out.retryAfterSeconds = secs;
  } else if (typeof body.retry_after_seconds === "number" && Number.isFinite(body.retry_after_seconds) && body.retry_after_seconds > 0) {
    out.retryAfterSeconds = Math.ceil(body.retry_after_seconds);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Plain-language extra line built from server limits ("" when none). */
export function otpLimitsMessage(limits?: OtpV2Limits): string {
  if (!limits) return "";
  const parts: string[] = [];
  if (limits.retryAfterSeconds) {
    const mins = Math.ceil(limits.retryAfterSeconds / 60);
    parts.push(mins <= 1 ? "Try again in 1 minute." : `Try again in ${mins} minutes.`);
  }
  if (limits.remainingAttempts !== undefined) {
    parts.push(limits.remainingAttempts === 1 ? "1 attempt left." : `${limits.remainingAttempts} attempts left.`);
  }
  return parts.join(" ");
}
export type OtpV2Result = OtpV2Success | OtpV2Failure;

export const isOtpV2Failure = (r: OtpV2Result): r is OtpV2Failure => r.ok === false;

const KNOWN_CODES: readonly OtpV2ErrorCode[] = [
  "INVALID_REQUEST",
  "UNAUTHORIZED",
  "BOOKING_NOT_FOUND",
  "LEGACY_BOOKING",
  "NOT_CURRENT_ASSIGNMENT",
  "TERMINAL_BOOKING",
  "CREDENTIAL_INVALID",
  "INVALID_STATUS",
  "START_NOT_VERIFIED",
  "INCORRECT_OTP",
  "LOCKED",
  "LIFETIME_LOCKED",
  "OTP_V2_UNAVAILABLE",
  "OTP_V2_OPERATION_FAILED",
];

export const GATEWAY_TIMEOUT_MS = 20_000;

const normalizeOtp = (value: unknown) =>
  String(value ?? "").replace(/\D/g, "").trim().slice(0, V2_OTP_LENGTH);

const failure = (code: OtpV2ErrorCode, message?: string, limits?: OtpV2Limits): OtpV2Failure => {
  const base = message || otpV2ErrorMessage(code);
  const extra = otpLimitsMessage(limits);
  return limits
    ? { ok: false, code, message: extra ? `${base} ${extra}` : base, limits }
    : { ok: false, code, message: base };
};

// Single-flight guard: one in-flight request per action+booking.
const inFlight = new Map<string, Promise<OtpV2Result>>();

async function extractErrorPayload(fnError: unknown): Promise<Record<string, unknown> | null> {
  try {
    const ctx = (fnError as { context?: Response })?.context;
    if (ctx && typeof ctx.clone === "function") {
      const parsed = await ctx.clone().json().catch(() => null);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return null;
}

function toErrorCode(raw: unknown): OtpV2ErrorCode {
  const code = String(raw ?? "").toUpperCase() as OtpV2ErrorCode;
  return KNOWN_CODES.includes(code) ? code : "OTP_V2_OPERATION_FAILED";
}

/**
 * Make sure a current worker Supabase session exists before calling the
 * gateway; refresh it when it is about to expire. Returns false when the
 * worker must sign in again.
 */
async function ensureWorkerSession(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getSession();
    const session = data?.session;
    if (error || !session?.access_token) return false;
    const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
    if (expiresAtMs && Date.now() > expiresAtMs - 60_000) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshed?.session?.access_token) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function refreshWorkerSession(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    return !error && !!data?.session?.access_token;
  } catch {
    return false;
  }
}

type RawResponse =
  | { kind: "ok"; data: unknown }
  | { kind: "http_error"; status: number | null; payload: Record<string, unknown> | null; message: string }
  | { kind: "network" }
  | { kind: "timeout" };

async function invokeGateway(body: Record<string, unknown>): Promise<RawResponse> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<RawResponse>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout" }), GATEWAY_TIMEOUT_MS);
  });
  const call = (async (): Promise<RawResponse> => {
    try {
      const res = await supabase.functions.invoke("otp-v2-gateway", { body });
      if (res.error) {
        const payload = await extractErrorPayload(res.error);
        const status = (res.error as { context?: Response })?.context?.status ?? null;
        // FunctionsFetchError (no HTTP response at all) → network failure.
        if (status === null && (res.error as { name?: string })?.name === "FunctionsFetchError") {
          return { kind: "network" };
        }
        return { kind: "http_error", status, payload, message: (res.error as Error)?.message ?? "" };
      }
      return { kind: "ok", data: res.data };
    } catch {
      return { kind: "network" };
    }
  })();
  try {
    return await Promise.race([call, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function callGateway(action: OtpV2Action, bookingId: string, otp: string): Promise<OtpV2Result> {
  if (!(await ensureWorkerSession())) return failure("UNAUTHORIZED");

  let raw = await invokeGateway({ action, booking_id: bookingId, otp });

  // 401 = request rejected before processing → refresh once and retry once.
  if (raw.kind === "http_error" && raw.status === 401) {
    if (!(await refreshWorkerSession())) return failure("UNAUTHORIZED");
    raw = await invokeGateway({ action, booking_id: bookingId, otp });
    if (raw.kind === "http_error" && raw.status === 401) return failure("UNAUTHORIZED");
  }

  if (raw.kind === "network") {
    console.warn("[OTP_V2] network failure", { action, bookingId });
    return failure("NETWORK");
  }
  if (raw.kind === "timeout") {
    console.warn("[OTP_V2] timeout", { action, bookingId });
    return failure("TIMEOUT");
  }
  if (raw.kind === "http_error") {
    // Gateway not deployed / unreachable. Never treated as legacy.
    if (raw.status === 404 && !raw.payload?.code && !raw.payload?.error_code) {
      console.warn("[OTP_V2] gateway not deployed (404)", { action, bookingId });
      return failure("OTP_V2_UNAVAILABLE");
    }
    const code = toErrorCode(raw.payload?.error_code ?? raw.payload?.code ?? raw.payload?.error);
    console.warn("[OTP_V2] gateway error", { action, bookingId, code, httpStatus: raw.status });
    return failure(code, otpV2ErrorMessage(code), parseOtpLimits(raw.payload));
  }

  const body = (raw.data ?? {}) as Record<string, unknown>;
  // HTTP 200 is not success by itself: require success === true AND the
  // status this action is supposed to produce.
  const expected = action === "verify_start" ? "started" : "completed";
  if (body.success === true && body.status === expected) {
    return { ok: true, status: expected, idempotent: body.idempotent === true };
  }
  if (body.success === true) {
    console.warn("[OTP_V2] unexpected success shape", { action, bookingId });
    return failure("OTP_V2_OPERATION_FAILED");
  }

  const code = toErrorCode(body.error_code ?? body.code ?? body.error);
  console.warn("[OTP_V2] verification refused", { action, bookingId, code });
  return failure(code, otpV2ErrorMessage(code), parseOtpLimits(body));
}

async function verify(action: OtpV2Action, bookingId: string, otpRaw: string): Promise<OtpV2Result> {
  const otp = normalizeOtp(otpRaw);
  // Start and Completion: exactly four digits (live gateway contract). For
  // completion the gateway answers LEGACY_BOOKING for pre-V2 bookings.
  const lengthOk = otp.length === V2_OTP_LENGTH;
  if (!bookingId || !lengthOk) {
    return failure(
      "INVALID_REQUEST",
      action === "verify_start" ? "Please enter the complete 4-digit OTP" : "Please enter the complete OTP",
    );
  }
  const key = `${action}:${bookingId}`;
  const existing = inFlight.get(key);
  if (existing) return existing; // duplicate submission → share the in-flight request

  const promise = callGateway(action, bookingId, otp)
    .then((result) => {
      const learned = modeFromResult(result);
      if (learned) rememberOtpMode(bookingId, learned);
      if (isOtpV2Failure(result) && (result.code === "NOT_CURRENT_ASSIGNMENT" || result.code === "TERMINAL_BOOKING" || result.code === "BOOKING_NOT_FOUND")) {
        forgetOtpMode(bookingId);
      }
      return result;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}

export const verifyStartOtp = (bookingId: string, otp: string) => verify("verify_start", bookingId, otp);
export const verifyCompletionOtp = (bookingId: string, otp: string) => verify("verify_completion", bookingId, otp);

// ── OTP mode (display only) ──────────────────────────────────────────
// Used only to choose which button the job card shows. It is kept in memory
// (never persisted), expires quickly, and is NEVER consulted to authorize
// legacy completion — that requires a LEGACY_BOOKING answer in the same
// submission (see decideCompletion in otpCompletionFlow.ts).

export type OtpMode = "v2" | "legacy";
export type ResolvedOtpMode = OtpMode | "unavailable";

export const MODE_CACHE_TTL_MS = 2 * 60 * 1000;
const modeCache = new Map<string, { mode: OtpMode; at: number }>();

export function rememberOtpMode(bookingId: string, mode: OtpMode): void {
  modeCache.set(bookingId, { mode, at: Date.now() });
}

export function forgetOtpMode(bookingId: string): void {
  modeCache.delete(bookingId);
}

export function getCachedOtpMode(bookingId: string): OtpMode | null {
  const hit = modeCache.get(bookingId);
  if (!hit) return null;
  if (Date.now() - hit.at > MODE_CACHE_TTL_MS) {
    modeCache.delete(bookingId);
    return null;
  }
  return hit.mode;
}

/** Test helper. */
export function __resetOtpV2State(): void {
  modeCache.clear();
  inFlight.clear();
}

const V2_ONLY_CODES: readonly OtpV2ErrorCode[] = [
  "START_NOT_VERIFIED",
  "INCORRECT_OTP",
  "LOCKED",
  "LIFETIME_LOCKED",
  "CREDENTIAL_INVALID",
  "INVALID_STATUS",
];

/** What a gateway answer proves about the booking's mode (null = nothing). */
export function modeFromResult(result: OtpV2Result): OtpMode | null {
  if (!isOtpV2Failure(result)) return "v2";
  if (result.code === "LEGACY_BOOKING") return "legacy";
  if (V2_ONLY_CODES.includes(result.code)) return "v2";
  return null;
}

/**
 * Ask the backend which OTP mode a booking uses (proposed `resolve_mode`
 * action — see docs/otp-v2-resolve-mode-contract.md).
 *
 * Accepted success shape ONLY:
 *   { success: true, booking_id: <same id>, otp_mode: "legacy" | "v2",
 *     assignment_generation: number | null, start_verified?: boolean }
 * Anything else (404, unknown action, network, timeout, malformed body,
 * mismatched booking_id) resolves to "unavailable" — never a guess.
 * NOT_CURRENT_ASSIGNMENT / TERMINAL_BOOKING / BOOKING_NOT_FOUND also clear the
 * cached mode and ask the active-job screen to refetch.
 */
export async function resolveOtpMode(bookingId: string): Promise<ResolvedOtpMode> {
  if (!bookingId) return "unavailable";
  const cached = getCachedOtpMode(bookingId);
  if (cached) return cached;
  if (!(await ensureWorkerSession())) return "unavailable";

  const raw = await invokeGateway({ action: "resolve_mode", booking_id: bookingId });
  if (raw.kind === "http_error") {
    const code = toErrorCode(raw.payload?.error_code ?? raw.payload?.code);
    if (code === "NOT_CURRENT_ASSIGNMENT" || code === "TERMINAL_BOOKING" || code === "BOOKING_NOT_FOUND") {
      forgetOtpMode(bookingId);
      try {
        window.dispatchEvent(new CustomEvent("bookingReassigned", { detail: { bookingId, source: "otp_resolve_mode" } }));
      } catch {
        // non-browser
      }
    }
    return "unavailable";
  }
  if (raw.kind !== "ok") return "unavailable";
  const body = (raw.data ?? {}) as Record<string, unknown>;
  const generationOk =
    body.assignment_generation === null ||
    body.assignment_generation === undefined ||
    (typeof body.assignment_generation === "number" && Number.isInteger(body.assignment_generation));
  if (
    body.success === true &&
    body.booking_id === bookingId &&
    (body.otp_mode === "v2" || body.otp_mode === "legacy") &&
    generationOk
  ) {
    rememberOtpMode(bookingId, body.otp_mode);
    return body.otp_mode;
  }
  return "unavailable";
}

// ── Job card action ──────────────────────────────────────────────────
export type OtpCardAction = "start" | "complete" | "resolving" | "unavailable" | "none";

const ACTIVE_STATUSES = ["assigned", "accepted", "on_the_way", "started"];

/**
 * Which OTP action the job card offers.
 * - Client V2 off → original legacy lifecycle: Complete from every active status.
 * - Legacy booking → same original lifecycle, no Start OTP.
 * - V2 booking → Start before verified start, Complete only once started.
 * - Mode unknown → resolving/unavailable; never a completion shortcut.
 */
export function getOtpCardAction(params: {
  v2Enabled: boolean;
  mode: ResolvedOtpMode | "resolving";
  status: string;
}): OtpCardAction {
  const { v2Enabled, mode, status } = params;
  if (!ACTIVE_STATUSES.includes(status)) return "none";
  if (!v2Enabled) return "complete";
  if (mode === "legacy") return "complete";
  if (mode === "v2") return status === "started" ? "complete" : "start";
  return mode === "resolving" ? "resolving" : "unavailable";
}

/** User-facing message for a V2 error code. */
export function otpV2ErrorMessage(code: OtpV2ErrorCode, fallback?: string): string {
  switch (code) {
    case "INCORRECT_OTP":
      return "Wrong OTP. Please ask the customer for the correct code.";
    case "LOCKED":
      return "Too many wrong attempts. This OTP is locked for now.";
    case "LIFETIME_LOCKED":
      return "This OTP is permanently locked. Please contact support.";
    case "START_NOT_VERIFIED":
      return "Start OTP has not been verified yet. Start the booking first.";
    case "LEGACY_BOOKING":
      return "This booking uses the previous OTP system.";
    case "NOT_CURRENT_ASSIGNMENT":
      return "This booking is no longer assigned to you.";
    case "TERMINAL_BOOKING":
      return "This booking is already finished or cancelled.";
    case "BOOKING_NOT_FOUND":
      return "Booking not found.";
    case "UNAUTHORIZED":
      return "Session expired. Please log in again.";
    case "CREDENTIAL_INVALID":
      return "The customer's code is not ready yet. Please call the manager.";
    case "INVALID_STATUS":
      return "This booking can't be updated right now.";
    case "OTP_V2_UNAVAILABLE":
      return "Verification service is temporarily unavailable. Please try again shortly.";
    case "NETWORK":
      return "Network error. Please try again.";
    case "TIMEOUT":
      return "The server is taking too long. Please try again.";
    default:
      return fallback || "Verification failed. Please try again.";
  }
}
