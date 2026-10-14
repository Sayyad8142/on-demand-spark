import { supabase } from "@/integrations/supabase/client";

/**
 * OTP V2 gateway client (two-stage OTP: Start OTP + Completion OTP).
 *
 * Contract (backend finalized in source, NOT yet deployed):
 *   POST /functions/v1/otp-v2-gateway
 *   { action: "verify_start" | "verify_completion", booking_id, otp }
 *   → { success: true, status: "started" | "completed", idempotent: boolean }
 *   → errors: INVALID_REQUEST, UNAUTHORIZED, BOOKING_NOT_FOUND, LEGACY_BOOKING,
 *     NOT_CURRENT_ASSIGNMENT, TERMINAL_BOOKING, CREDENTIAL_INVALID, INVALID_STATUS,
 *     START_NOT_VERIFIED, INCORRECT_OTP, LOCKED, LIFETIME_LOCKED,
 *     OTP_V2_UNAVAILABLE, OTP_V2_OPERATION_FAILED
 *
 * Security rules honored here:
 * - OTP values are NEVER logged or persisted (only lengths).
 * - Worker identity comes from the current Supabase session; nothing client-supplied.
 * - Duplicate submissions are blocked with a single-flight guard.
 * - Idempotent responses are treated as success (safe retry).
 */

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
  | "NETWORK";

export type OtpV2Result =
  | { ok: true; status: "started" | "completed"; idempotent: boolean }
  | { ok: false; code: OtpV2ErrorCode; message: string };

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

const normalizeOtp = (value: unknown) =>
  String(value ?? "").replace(/\D/g, "").trim().slice(0, 4);

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

async function callGateway(action: OtpV2Action, bookingId: string, otp: string): Promise<OtpV2Result> {
  let fnError: unknown = null;
  let data: unknown = null;
  try {
    const res = await supabase.functions.invoke("otp-v2-gateway", {
      body: { action, booking_id: bookingId, otp },
    });
    fnError = res.error;
    data = res.data;
  } catch (err) {
    console.warn("[OTP_V2] network failure", { action, bookingId, message: err instanceof Error ? err.message : "unknown" });
    return { ok: false, code: "NETWORK", message: "Network error. Please try again." };
  }

  if (fnError) {
    const payload = await extractErrorPayload(fnError);
    // Function not deployed / unreachable → treat as unavailable, never fall back silently.
    const status = (fnError as { context?: Response })?.context?.status;
    if (status === 404) {
      console.warn("[OTP_V2] gateway not deployed (404)", { action, bookingId });
      return { ok: false, code: "OTP_V2_UNAVAILABLE", message: "Verification service is temporarily unavailable." };
    }
    const code = toErrorCode(payload?.code ?? payload?.error_code ?? payload?.error);
    const message = String(payload?.message ?? payload?.error ?? (fnError as Error).message ?? "Verification failed");
    console.warn("[OTP_V2] gateway error", { action, bookingId, code, httpStatus: status ?? null });
    return { ok: false, code, message };
  }

  const body = (data ?? {}) as Record<string, unknown>;
  if (body.success === true) {
    const status = body.status === "started" ? "started" : "completed";
    return { ok: true, status, idempotent: body.idempotent === true };
  }

  const code = toErrorCode(body.code ?? body.error_code ?? body.error);
  const message = String(body.message ?? body.error ?? "Verification failed");
  console.warn("[OTP_V2] verification refused", { action, bookingId, code });
  return { ok: false, code, message };
}

async function verify(action: OtpV2Action, bookingId: string, otpRaw: string): Promise<OtpV2Result> {
  const otp = normalizeOtp(otpRaw);
  if (!bookingId || otp.length !== 4) {
    return { ok: false, code: "INVALID_REQUEST", message: "Please enter the complete 4-digit OTP" };
  }
  const key = `${action}:${bookingId}`;
  const existing = inFlight.get(key);
  if (existing) return existing; // duplicate submission → reuse the in-flight promise

  const promise = callGateway(action, bookingId, otp).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

export const verifyStartOtp = (bookingId: string, otp: string) => verify("verify_start", bookingId, otp);
export const verifyCompletionOtp = (bookingId: string, otp: string) => verify("verify_completion", bookingId, otp);

// ── OTP mode resolution ──────────────────────────────────────────────
// The backend contract has no pre-call mode signal: a booking's OTP mode can
// only be learned from the gateway's LEGACY_BOOKING error. We cache the
// resolved mode per booking (sessionStorage) so each booking pays the
// resolution cost once. "unknown" means no gateway call has resolved it yet.

export type OtpMode = "v2" | "legacy" | "unknown";

const modeKey = (bookingId: string) => `otp_mode:${bookingId}`;

export function getResolvedOtpMode(bookingId: string): OtpMode {
  try {
    const v = sessionStorage.getItem(modeKey(bookingId));
    if (v === "v2" || v === "legacy") return v;
  } catch {
    // storage unavailable
  }
  return "unknown";
}

export function setResolvedOtpMode(bookingId: string, mode: Exclude<OtpMode, "unknown">): void {
  try {
    sessionStorage.setItem(modeKey(bookingId), mode);
  } catch {
    // storage unavailable
  }
}

/** User-facing message for a V2 error code. */
export function otpV2ErrorMessage(code: OtpV2ErrorCode, fallback?: string): string {
  switch (code) {
    case "INCORRECT_OTP":
      return "Wrong OTP. Please ask the customer for the correct code.";
    case "LOCKED":
      return "Too many wrong attempts. This OTP is locked for 15 minutes.";
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
    case "OTP_V2_UNAVAILABLE":
      return "Verification service is temporarily unavailable. Please try again shortly.";
    case "NETWORK":
      return "Network error. Please try again.";
    default:
      return fallback || "Verification failed. Please try again.";
  }
}
