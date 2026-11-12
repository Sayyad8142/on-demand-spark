import { supabase } from "@/integrations/supabase/client";

/**
 * 4-digit Start OTP (worker side) — talks ONLY to the database RPC
 * `verify_start_otp(p_booking_id, p_otp)`.
 *
 * - Which button shows is decided per booking by the server flag
 *   `start_otp_required` (set by the server only while its master switch is on).
 *   Bookings without the flag keep the legacy End OTP flow exactly.
 * - Worker identity comes only from the Supabase session (auth.uid()); no worker_id sent.
 * - The OTP is never logged, stored, cached, or put in URLs/analytics.
 * - "Started" is never set locally: success only means "refetch the booking".
 */
export const START_OTP_WORKER_ENABLED_DEFAULT = false;
export const START_OTP_LENGTH = 4;
export const START_OTP_TIMEOUT_MS = 15_000;
/** Statuses from which the server allows a start (matches verify_start_otp). */
export const START_ALLOWED_STATUSES = ["assigned", "accepted", "on_the_way"] as const;

/** Legacy local test override; no longer decides which button appears. */
export function isStartOtpWorkerEnabled(): boolean {
  try {
    const o = localStorage.getItem("start_otp_worker");
    if (o === "1") return true;
    if (o === "0") return false;
  } catch {
    /* storage unavailable */
  }
  return START_OTP_WORKER_ENABLED_DEFAULT;
}

export function canShowStartButton(startRequired: boolean, status: string): boolean {
  return startRequired && (START_ALLOWED_STATUSES as readonly string[]).includes(status);
}

export type StartCardAction = "start" | "complete" | "none";

/** Job-card action for a booking the server flagged start_otp_required = true. */
export function startOtpCardAction(status: string): StartCardAction {
  if (canShowStartButton(true, status)) return "start";
  if (status === "started") return "complete";
  return "none";
}

/** True when a flagged booking must be started before the End OTP screen may be used. */
export function mustStartFirst(startRequired: boolean | null | undefined, status: string | null | undefined): boolean {
  return startRequired === true && (START_ALLOWED_STATUSES as readonly string[]).includes(status ?? "");
}

export type StartOtpErrorCode =
  | "WRONG_CODE"
  | "LOCKED"
  | "TOO_FAST"
  | "EXPIRED"
  | "NOT_ASSIGNED"
  | "INVALID_STATUS"
  | "CODE_UNAVAILABLE"
  | "UNAUTHORIZED"
  | "LEGACY_BOOKING"
  | "INVALID_FORMAT"
  | "BOOKING_NOT_FOUND"
  | "INTERNAL"
  | "NETWORK";

export type StartOtpResult =
  | { ok: true; alreadyStarted: boolean }
  | { ok: false; code: StartOtpErrorCode; attemptsLeft?: number };

const KNOWN = new Set<string>([
  "WRONG_CODE", "LOCKED", "TOO_FAST", "EXPIRED", "NOT_ASSIGNED", "INVALID_STATUS",
  "CODE_UNAVAILABLE", "UNAUTHORIZED", "LEGACY_BOOKING", "INVALID_FORMAT", "BOOKING_NOT_FOUND",
]);

/** English message (translated at display time via displayText). */
export function startOtpMessage(code: StartOtpErrorCode): string {
  switch (code) {
    case "WRONG_CODE":
      return "Incorrect code. Ask the customer for the 4-digit Start OTP.";
    case "LOCKED":
      return "Too many wrong tries. Please call support.";
    case "TOO_FAST":
      return "Please wait before trying again.";
    case "EXPIRED":
      return "This OTP has expired. Ask the customer to open the app for a new code.";
    case "NOT_ASSIGNED":
    case "BOOKING_NOT_FOUND":
      return "This booking is not assigned to you.";
    case "INVALID_STATUS":
      return "This booking can't be started now. It may be cancelled or reassigned.";
    case "CODE_UNAVAILABLE":
      return "Start code is not available. Please call support.";
    case "UNAUTHORIZED":
      return "Please sign in again.";
    case "INVALID_FORMAT":
      return "Please enter the complete 4-digit OTP";
    default:
      return "Couldn't check the code. Please try again.";
  }
}

async function call(bookingId: string, otp: string): Promise<StartOtpResult> {
  if (!bookingId || !new RegExp(`^\\d{${START_OTP_LENGTH}}$`).test(otp)) return { ok: false, code: "INVALID_FORMAT" };
  try {
    const { data: s } = await supabase.auth.getSession();
    if (!s?.session?.access_token) return { ok: false, code: "UNAUTHORIZED" };
  } catch {
    return { ok: false, code: "UNAUTHORIZED" };
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<StartOtpResult>((r) => {
    timer = setTimeout(() => r({ ok: false, code: "NETWORK" }), START_OTP_TIMEOUT_MS);
  });
  const req = (async (): Promise<StartOtpResult> => {
    try {
      const res = await supabase.rpc("verify_start_otp", { p_booking_id: bookingId, p_otp: otp });
      if (res.error) {
        const st = (res as { status?: number }).status;
        return { ok: false, code: st === 401 || st === 403 ? "UNAUTHORIZED" : "INTERNAL" };
      }
      const body = (res.data ?? {}) as Record<string, unknown>;
      if (body.success === true) return { ok: true, alreadyStarted: body.already_started === true };
      const c = typeof body.code === "string" && KNOWN.has(body.code) ? (body.code as StartOtpErrorCode) : "INTERNAL";
      const left = typeof body.attempts_left === "number" ? body.attempts_left : undefined;
      return left === undefined ? { ok: false, code: c } : { ok: false, code: c, attemptsLeft: left };
    } catch {
      return { ok: false, code: "NETWORK" };
    }
  })();
  try {
    return await Promise.race([req, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const inFlight = new Map<string, Promise<StartOtpResult>>();

/** One in-flight request per booking; a second tap shares the first answer. */
export function verifyStartOtp(bookingId: string, otp: string): Promise<StartOtpResult> {
  const existing = inFlight.get(bookingId);
  if (existing) return existing;
  const p = call(bookingId, otp).finally(() => inFlight.delete(bookingId));
  inFlight.set(bookingId, p);
  return p;
}

export function __resetStartOtpState() {
  inFlight.clear();
}
