import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const invoke = vi.fn();
const getSession = vi.fn();
const refreshSession = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    auth: {
      getSession: (...a: unknown[]) => getSession(...a),
      refreshSession: (...a: unknown[]) => refreshSession(...a),
    },
  },
}));

import {
  verifyStartOtp,
  verifyCompletionOtp,
  resolveOtpMode,
  rememberOtpMode,
  getCachedOtpMode,
  getOtpCardAction,
  isOtpV2ClientEnabled,
  MODE_CACHE_TTL_MS,
  GATEWAY_TIMEOUT_MS,
  __resetOtpV2State,
} from "@/lib/otpV2";
import { decideCompletion, TERMINAL_CODES, RETRYABLE_CODES } from "@/lib/otpCompletionFlow";

const B = "booking-1";
const OTP = "4821";

const validSession = () => ({
  data: { session: { access_token: "worker-token", expires_at: Math.floor(Date.now() / 1000) + 3600 } },
  error: null,
});

const ok = (data: unknown) => ({ data, error: null });
const httpErr = (status: number, payload: unknown) => ({
  data: null,
  error: {
    name: "FunctionsHttpError",
    message: "Edge Function returned a non-2xx status code",
    context: new Response(JSON.stringify(payload), { status }),
  },
});
const fetchErr = () => ({
  data: null,
  error: { name: "FunctionsFetchError", message: "Failed to send a request", context: new TypeError("fetch failed") },
});

let logs: string[] = [];

beforeEach(() => {
  __resetOtpV2State();
  invoke.mockReset();
  getSession.mockReset().mockResolvedValue(validSession());
  refreshSession.mockReset().mockResolvedValue(validSession());
  localStorage.clear();
  sessionStorage.clear();
  logs = [];
  for (const m of ["log", "warn", "error", "info", "debug"] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      logs.push(JSON.stringify(args));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const expectNoOtpLeak = () => {
  expect(logs.join("\n")).not.toContain(OTP);
  const stores = [localStorage, sessionStorage];
  for (const s of stores) {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)!;
      expect(k + (s.getItem(k) ?? "")).not.toContain(OTP);
    }
  }
};

describe("Scenario 1-3: legacy booking completion from assigned / accepted / on_the_way", () => {
  for (const status of ["assigned", "accepted", "on_the_way"]) {
    it(`legacy (${status}): card offers Complete, no Start OTP; gateway LEGACY_BOOKING routes to legacy`, async () => {
      // V2 client on + backend says legacy
      expect(getOtpCardAction({ v2Enabled: true, mode: "legacy", status })).toBe("complete");
      // V2 client off → original lifecycle
      expect(getOtpCardAction({ v2Enabled: false, mode: "resolving", status })).toBe("complete");

      invoke.mockResolvedValueOnce(httpErr(409, { code: "LEGACY_BOOKING" }));
      const d = await decideCompletion(B, OTP, true);
      expect(d).toEqual({ path: "legacy" });
      expectNoOtpLeak();
    });
  }

  it("V2 client off: legacy completion without any gateway call", async () => {
    const d = await decideCompletion(B, OTP, false);
    expect(d).toEqual({ path: "legacy" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("V2 client is off by default", () => {
    expect(isOtpV2ClientEnabled()).toBe(false);
    localStorage.setItem("otp_v2_client", "1");
    expect(isOtpV2ClientEnabled()).toBe(true);
  });
});

describe("Scenario 4-7: V2 start and completion", () => {
  it("4. Start OTP success → started; card then offers Complete", async () => {
    invoke.mockResolvedValueOnce(ok({ success: true, status: "started", idempotent: false }));
    const r = await verifyStartOtp(B, OTP);
    expect(r).toEqual({ ok: true, status: "started", idempotent: false });
    expect(invoke).toHaveBeenCalledWith("otp-v2-gateway", { body: { action: "verify_start", booking_id: B, otp: OTP } });
    expect(getCachedOtpMode(B)).toBe("v2");
    expect(getOtpCardAction({ v2Enabled: true, mode: "v2", status: "started" })).toBe("complete");
    expectNoOtpLeak();
  });

  it("V2 before start: card shows Start, never Complete", () => {
    for (const status of ["assigned", "accepted", "on_the_way"]) {
      expect(getOtpCardAction({ v2Enabled: true, mode: "v2", status })).toBe("start");
    }
  });

  it("5. Start OTP incorrect → INCORRECT_OTP, nothing started", async () => {
    invoke.mockResolvedValueOnce(httpErr(400, { code: "INCORRECT_OTP" }));
    const r = await verifyStartOtp(B, OTP);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.code).toBe("INCORRECT_OTP");
    expectNoOtpLeak();
  });

  it("6. Completion before Start → START_NOT_VERIFIED, no legacy fallback", async () => {
    invoke.mockResolvedValueOnce(httpErr(409, { code: "START_NOT_VERIFIED" }));
    const d = await decideCompletion(B, OTP, true);
    expect(d.path).toBe("v2_error");
    expect(d.path === "v2_error" && d.code).toBe("START_NOT_VERIFIED");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("7. Completion OTP success → v2_completed", async () => {
    invoke.mockResolvedValueOnce(ok({ success: true, status: "completed", idempotent: false }));
    const d = await decideCompletion(B, OTP, true);
    expect(d).toEqual({ path: "v2_completed", idempotent: false });
    expectNoOtpLeak();
  });
});

describe("Scenario 8-11: lockouts, reassignment, cancellation", () => {
  it("8. temporary lockout (5 wrong attempts) → LOCKED, not legacy", async () => {
    for (let i = 0; i < 5; i++) invoke.mockResolvedValueOnce(httpErr(400, { code: "INCORRECT_OTP" }));
    invoke.mockResolvedValueOnce(httpErr(429, { code: "LOCKED" }));
    for (let i = 0; i < 5; i++) {
      const d = await decideCompletion(B, OTP, true);
      expect(d.path === "v2_error" && d.code).toBe("INCORRECT_OTP");
    }
    const d = await decideCompletion(B, OTP, true);
    expect(d.path === "v2_error" && d.code).toBe("LOCKED");
    expect(RETRYABLE_CODES).not.toContain("LOCKED");
  });

  it("9. lifetime lockout → LIFETIME_LOCKED, not legacy", async () => {
    invoke.mockResolvedValueOnce(httpErr(423, { code: "LIFETIME_LOCKED" }));
    const d = await decideCompletion(B, OTP, true);
    expect(d.path === "v2_error" && d.code).toBe("LIFETIME_LOCKED");
  });

  it("10. reassignment → NOT_CURRENT_ASSIGNMENT closes screen and clears cached mode", async () => {
    rememberOtpMode(B, "v2");
    invoke.mockResolvedValueOnce(httpErr(403, { code: "NOT_CURRENT_ASSIGNMENT" }));
    const r = await verifyStartOtp(B, OTP);
    expect(r.ok === false && r.code).toBe("NOT_CURRENT_ASSIGNMENT");
    expect(TERMINAL_CODES).toContain("NOT_CURRENT_ASSIGNMENT");
    expect(getCachedOtpMode(B)).toBeNull();
  });

  it("11. cancellation → TERMINAL_BOOKING closes screen; card hides for cancelled", async () => {
    invoke.mockResolvedValueOnce(httpErr(409, { code: "TERMINAL_BOOKING" }));
    const d = await decideCompletion(B, OTP, true);
    expect(d.path === "v2_error" && d.code).toBe("TERMINAL_BOOKING");
    expect(TERMINAL_CODES).toContain("TERMINAL_BOOKING");
    expect(getOtpCardAction({ v2Enabled: true, mode: "v2", status: "cancelled" })).toBe("none");
    expect(getOtpCardAction({ v2Enabled: false, mode: "legacy", status: "completed" })).toBe("none");
  });
});

describe("Scenario 12: network failure and retry", () => {
  it("network error → NETWORK (retryable, not legacy); retry succeeds", async () => {
    invoke.mockResolvedValueOnce(fetchErr());
    const d1 = await decideCompletion(B, OTP, true);
    expect(d1.path === "v2_error" && d1.code).toBe("NETWORK");
    expect(RETRYABLE_CODES).toContain("NETWORK");

    invoke.mockResolvedValueOnce(ok({ success: true, status: "completed", idempotent: true }));
    const d2 = await decideCompletion(B, OTP, true);
    expect(d2).toEqual({ path: "v2_completed", idempotent: true });
    expectNoOtpLeak();
  });

  it("thrown invoke → NETWORK", async () => {
    invoke.mockRejectedValueOnce(new Error("offline"));
    const r = await verifyCompletionOtp(B, OTP);
    expect(r.ok === false && r.code).toBe("NETWORK");
  });

  it("timeout → TIMEOUT, not legacy", async () => {
    vi.useFakeTimers();
    invoke.mockImplementationOnce(() => new Promise(() => {}));
    const p = decideCompletion(B, OTP, true);
    await vi.advanceTimersByTimeAsync(GATEWAY_TIMEOUT_MS + 10);
    const d = await p;
    expect(d.path === "v2_error" && d.code).toBe("TIMEOUT");
  });
});

describe("Legacy fallback security", () => {
  it("gateway 404 (not deployed) → OTP_V2_UNAVAILABLE, never legacy", async () => {
    invoke.mockResolvedValueOnce(httpErr(404, { message: "Function not found" }));
    const d = await decideCompletion(B, OTP, true);
    expect(d.path === "v2_error" && d.code).toBe("OTP_V2_UNAVAILABLE");
  });

  it("404 carrying BOOKING_NOT_FOUND keeps that code", async () => {
    invoke.mockResolvedValueOnce(httpErr(404, { code: "BOOKING_NOT_FOUND" }));
    const d = await decideCompletion(B, OTP, true);
    expect(d.path === "v2_error" && d.code).toBe("BOOKING_NOT_FOUND");
  });

  const nonLegacy = [
    "OTP_V2_UNAVAILABLE", "UNAUTHORIZED", "INCORRECT_OTP", "LOCKED", "LIFETIME_LOCKED",
    "CREDENTIAL_INVALID", "INVALID_STATUS", "INVALID_REQUEST", "OTP_V2_OPERATION_FAILED", "SOMETHING_NEW",
  ];
  for (const code of nonLegacy) {
    it(`${code} never falls back to legacy`, async () => {
      invoke.mockResolvedValueOnce(httpErr(code === "UNAUTHORIZED" ? 403 : 400, { code }));
      const d = await decideCompletion(B, OTP, true);
      expect(d.path).toBe("v2_error");
    });
  }

  it("stale cached 'legacy' cannot authorize legacy after booking becomes V2", async () => {
    rememberOtpMode(B, "legacy");
    invoke.mockResolvedValueOnce(httpErr(409, { code: "START_NOT_VERIFIED" }));
    const d = await decideCompletion(B, OTP, true);
    expect(invoke).toHaveBeenCalledTimes(1); // gateway always asked
    expect(d.path).toBe("v2_error");
    expect(getCachedOtpMode(B)).toBe("v2"); // display cache corrected
  });

  it("mode cache is memory-only and expires", () => {
    vi.useFakeTimers();
    rememberOtpMode(B, "legacy");
    expect(sessionStorage.length + localStorage.length).toBe(0);
    vi.advanceTimersByTime(MODE_CACHE_TTL_MS + 1);
    expect(getCachedOtpMode(B)).toBeNull();
  });

  it("success body without a valid status is not treated as success", async () => {
    invoke.mockResolvedValueOnce(ok({ success: true }));
    const r = await verifyCompletionOtp(B, OTP);
    expect(r.ok).toBe(false);
  });
});

describe("Duplicate submissions and idempotency", () => {
  it("parallel duplicate submissions share one request", async () => {
    let resolve!: (v: unknown) => void;
    invoke.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const p1 = verifyCompletionOtp(B, OTP);
    const p2 = verifyCompletionOtp(B, OTP);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    resolve(ok({ success: true, status: "completed", idempotent: false }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(r2);
  });

  it("idempotent success is success", async () => {
    invoke.mockResolvedValueOnce(ok({ success: true, status: "started", idempotent: true }));
    const r = await verifyStartOtp(B, OTP);
    expect(r).toEqual({ ok: true, status: "started", idempotent: true });
  });

  it("incomplete OTP is refused locally without a request", async () => {
    const r = await verifyStartOtp(B, "12");
    expect(r.ok === false && r.code).toBe("INVALID_REQUEST");
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("Authentication", () => {
  it("sends only action/booking/otp — no worker id, no manual token header", async () => {
    invoke.mockResolvedValueOnce(ok({ success: true, status: "started", idempotent: false }));
    await verifyStartOtp(B, OTP);
    const [, opts] = invoke.mock.calls[0] as [string, { body: Record<string, unknown>; headers?: unknown }];
    expect(Object.keys(opts.body).sort()).toEqual(["action", "booking_id", "otp"]);
    expect(opts.headers).toBeUndefined(); // supabase-js attaches the worker session token
  });

  it("no session → UNAUTHORIZED without calling the gateway", async () => {
    getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    const r = await verifyStartOtp(B, OTP);
    expect(r.ok === false && r.code).toBe("UNAUTHORIZED");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("expiring session is refreshed before the call", async () => {
    getSession.mockResolvedValueOnce({
      data: { session: { access_token: "t", expires_at: Math.floor(Date.now() / 1000) + 10 } },
      error: null,
    });
    invoke.mockResolvedValueOnce(ok({ success: true, status: "started", idempotent: false }));
    await verifyStartOtp(B, OTP);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("401 → refresh once and retry once", async () => {
    invoke
      .mockResolvedValueOnce(httpErr(401, { code: "UNAUTHORIZED" }))
      .mockResolvedValueOnce(ok({ success: true, status: "completed", idempotent: false }));
    const r = await verifyCompletionOtp(B, OTP);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
  });

  it("401 twice → UNAUTHORIZED (no third try, no legacy)", async () => {
    invoke
      .mockResolvedValueOnce(httpErr(401, {}))
      .mockResolvedValueOnce(httpErr(401, {}));
    const d = await decideCompletion(B, OTP, true);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(d.path === "v2_error" && d.code).toBe("UNAUTHORIZED");
  });

  it("refresh failure → UNAUTHORIZED", async () => {
    invoke.mockResolvedValueOnce(httpErr(401, {}));
    refreshSession.mockResolvedValueOnce({ data: { session: null }, error: { message: "expired" } });
    const r = await verifyStartOtp(B, OTP);
    expect(r.ok === false && r.code).toBe("UNAUTHORIZED");
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

describe("Mode resolution (unknown mode)", () => {
  it("unknown mode never offers Complete or Start", () => {
    for (const status of ["assigned", "accepted", "on_the_way", "started"]) {
      expect(getOtpCardAction({ v2Enabled: true, mode: "resolving", status })).toBe("resolving");
      expect(getOtpCardAction({ v2Enabled: true, mode: "unavailable", status })).toBe("unavailable");
    }
  });

  it("resolver 404 / malformed / network → unavailable (no guess)", async () => {
    invoke.mockResolvedValueOnce(httpErr(404, {}));
    expect(await resolveOtpMode(B)).toBe("unavailable");
    invoke.mockResolvedValueOnce(ok({ success: true, mode: "maybe" }));
    expect(await resolveOtpMode(B)).toBe("unavailable");
    invoke.mockResolvedValueOnce(fetchErr());
    expect(await resolveOtpMode(B)).toBe("unavailable");
  });

  it("explicit backend answer resolves the mode", async () => {
    invoke.mockResolvedValueOnce(ok({ success: true, mode: "legacy" }));
    expect(await resolveOtpMode(B)).toBe("legacy");
    expect(invoke).toHaveBeenCalledWith("otp-v2-gateway", { body: { action: "resolve_mode", booking_id: B } });
  });
});
