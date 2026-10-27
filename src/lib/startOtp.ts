import { supabase } from "@/integrations/supabase/client";

/**
 * 4-digit Start OTP (worker side) — talks ONLY to `verify-start-otp`.
 *
 * - Rollout switch START_OTP_WORKER_ENABLED (default false). OFF → the app
 *   behaves exactly like before; this module never calls the server.
 * - Worker identity comes only from the Supabase session; no worker_id sent.
 * - The OTP is never logged, stored, cached, or put in URLs/analytics.
 * - "Started" is never set locally: success only means "refetch the booking".
 */
export const START_OTP_WORKER_ENABLED_DEFAULT = false;
export const START_OTP_LENGTH = 4;
export const START_OTP_TIMEOUT_MS = 15_000;
/** Statuses from which the server allows a start. */
export const START_ALLOWED_STATUSES = ["assigned", "accepted", "confirmed", "on_the_way", "reached"] as const;

export function isStartOtpWorkerEnabled(): boolean {
  // Test-phone override only; the server is the sole authority for starting.
  try {
    const o = localStorage.getItem("start_otp_worker");
    if (o === "1") return true;
    if (o === "0") return false;
  } catch {
    /* storage unavailable */
  }
  return START_OTP_WORKER_ENABLED_DEFAULT;
}

export function canShowStartButton(enabled: boolean, status: string): boolean {
  return enabled && (START_ALLOWED_STATUSES as readonly string[]).includes(status);
}

export type StartOtpErrorCode =
  | "INVALID_REQUEST"
  | "INCORRECT_OTP"
  | "LOCKED"
  | "NOT_ASSIGNED"
  | "NOT_AVAILABLE"
  | "UNAUTHENTICATED"
  | "INTERNAL"
  | "NETWORK";

export type StartOtpResult = { ok: true; idempotent: boolean } | { ok: false; code: StartOtpErrorCode };

const STATUS_TO_CODE: Record<number, StartOtpErrorCode> = {
  400: "INVALID_REQUEST",
  401: "UNAUTHENTICATED",
  403: "NOT_ASSIGNED",
  409: "NOT_AVAILABLE",
  422: "INCORRECT_OTP",
  423: "LOCKED",
  500: "INTERNAL",
};
const KNOWN = new Set<string>(Object.values(STATUS_TO_CODE));

export function startOtpMessage(code: StartOtpErrorCode): string {
  switch (code) {
    case "INCORRECT_OTP":
      return "Incorrect code. Ask the customer for the 4-digit Start OTP.";
    case "LOCKED":
      return "Too many wrong tries. Please call support.";
    case "NOT_AVAILABLE":
      return "This booking can't be started now. It may be cancelled or reassigned.";
    case "NOT_ASSIGNED":
      return "This booking is not assigned to you.";
    case "UNAUTHENTICATED":
      return "Please sign in again.";
    case "INVALID_REQUEST":
      return "Please enter the complete 4-digit OTP";
    default:
      return "Couldn't check the code. Please try again.";
  }
}

async function readCode(error: unknown): Promise<StartOtpErrorCode> {
  const ctx = (error as { context?: unknown })?.context;
  if (!(ctx instanceof Response)) return "NETWORK";
  let bodyCode: string | undefined;
  try {
    const j = await ctx.clone().json();
    bodyCode = typeof j?.error_code === "string" ? j.error_code : typeof j?.code === "string" ? j.code : undefined;
  } catch {
    /* non-JSON */
  }
  if (bodyCode && KNOWN.has(bodyCode)) return bodyCode as StartOtpErrorCode;
  return STATUS_TO_CODE[ctx.status] ?? "INTERNAL";
}

async function call(bookingId: string, otp: string): Promise<StartOtpResult> {
  if (!bookingId || !new RegExp(`^\\d{${START_OTP_LENGTH}}$`).test(otp)) return { ok: false, code: "INVALID_REQUEST" };
  try {
    const { data: s } = await supabase.auth.getSession();
    if (!s?.session?.access_token) return { ok: false, code: "UNAUTHENTICATED" };
  } catch {
    return { ok: false, code: "UNAUTHENTICATED" };
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<StartOtpResult>((r) => {
    timer = setTimeout(() => r({ ok: false, code: "NETWORK" }), START_OTP_TIMEOUT_MS);
  });
  const req = (async (): Promise<StartOtpResult> => {
    try {
      const res = await supabase.functions.invoke("verify-start-otp", { body: { booking_id: bookingId, otp } });
      if (res.error) return { ok: false, code: await readCode(res.error) };
      const body = (res.data ?? {}) as Record<string, unknown>;
      if (body.ok === true) return { ok: true, idempotent: body.idempotent === true };
      const c = typeof body.error_code === "string" ? body.error_code : body.code;
      return { ok: false, code: typeof c === "string" && KNOWN.has(c) ? (c as StartOtpErrorCode) : "INTERNAL" };
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
