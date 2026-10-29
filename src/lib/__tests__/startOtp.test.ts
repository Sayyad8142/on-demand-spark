import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const invoke = vi.fn();
const getSession = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    auth: { getSession: (...a: unknown[]) => getSession(...a) },
  },
}));

import {
  verifyStartOtp,
  startOtpMessage,
  canShowStartButton,
  startOtpCardAction,
  mustStartFirst,
  START_OTP_WORKER_ENABLED_DEFAULT,
  __resetStartOtpState,
} from "@/lib/startOtp";
import { getOtpCardAction } from "@/lib/otpCompletionFlow";
import { WORKER_BOOKING_COLUMNS } from "@/lib/workerBookingColumns";

const B = "b-1";
const OTP = "0427";
const ok = (data: unknown) => ({ data, error: null, status: 200 });

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
  localStorage.clear();
  __resetStartOtpState();
});

describe("Start OTP button visibility", () => {
  it("1. legacy booking (unflagged) keeps Complete with OTP", () => {
    expect(START_OTP_WORKER_ENABLED_DEFAULT).toBe(false);
    for (const s of ["assigned", "accepted", "on_the_way"]) {
      expect(getOtpCardAction({ v2Enabled: false, mode: "legacy", status: s })).toBe("complete");
      expect(canShowStartButton(false, s)).toBe(false);
      expect(mustStartFirst(false, s)).toBe(false);
    }
  });

  it("2. flagged booking shows Start for assigned/accepted/on_the_way only", () => {
    for (const s of ["assigned", "accepted", "on_the_way"]) expect(startOtpCardAction(s)).toBe("start");
    for (const s of ["completed", "cancelled", "pending", "reached", "confirmed"]) expect(startOtpCardAction(s)).toBe("none");
  });

  it("7. flagged + started shows the existing End OTP completion", () => {
    expect(startOtpCardAction("started")).toBe("complete");
    expect(mustStartFirst(true, "started")).toBe(false);
  });

  it("8. End OTP screen is blocked for flagged bookings not yet started", () => {
    for (const s of ["assigned", "accepted", "on_the_way"]) expect(mustStartFirst(true, s)).toBe(true);
    expect(mustStartFirst(null, "assigned")).toBe(false);
  });

  it("booking reads include the flag but never OTP values", () => {
    const cols = WORKER_BOOKING_COLUMNS.split(",");
    expect(cols).toContain("start_otp_required");
    expect(cols.some((c) => /otp$|start_otp$|code_hash|code_salt/.test(c) && c !== "start_otp_required")).toBe(false);
  });
});

describe("verify_start_otp RPC", () => {
  it("calls only the RPC with booking id + otp (no worker id, no edge function)", async () => {
    rpc.mockResolvedValue(ok({ success: true }));
    expect(await verifyStartOtp(B, OTP)).toEqual({ ok: true, alreadyStarted: false });
    expect(rpc).toHaveBeenCalledWith("verify_start_otp", { p_booking_id: B, p_otp: OTP });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("3. correct code → started; already_started is also success", async () => {
    rpc.mockResolvedValue(ok({ success: true, already_started: true }));
    expect(await verifyStartOtp(B, OTP)).toEqual({ ok: true, alreadyStarted: true });
  });

  it("4. wrong code returns attempts left", async () => {
    rpc.mockResolvedValue(ok({ success: false, code: "WRONG_CODE", attempts_left: 3 }));
    expect(await verifyStartOtp(B, OTP)).toEqual({ ok: false, code: "WRONG_CODE", attemptsLeft: 3 });
  });

  it("5. locked, expired and rate-limited", async () => {
    for (const code of ["LOCKED", "EXPIRED", "TOO_FAST"]) {
      rpc.mockResolvedValue(ok({ success: false, code }));
      expect(await verifyStartOtp(B, OTP)).toEqual({ ok: false, code });
    }
    expect(startOtpMessage("LOCKED")).toBe("Too many wrong tries. Please call support.");
    expect(startOtpMessage("TOO_FAST")).toBe("Please wait before trying again.");
    expect(startOtpMessage("EXPIRED")).toMatch(/expired/);
  });

  it("6. reassigned booking: previous worker gets NOT_ASSIGNED / CODE_UNAVAILABLE", async () => {
    rpc.mockResolvedValue(ok({ success: false, code: "NOT_ASSIGNED" }));
    expect(await verifyStartOtp(B, OTP)).toEqual({ ok: false, code: "NOT_ASSIGNED" });
    rpc.mockResolvedValue(ok({ success: false, code: "CODE_UNAVAILABLE" }));
    expect(await verifyStartOtp(B, OTP)).toEqual({ ok: false, code: "CODE_UNAVAILABLE" });
  });

  it("other server codes pass through; unknown → INTERNAL", async () => {
    for (const code of ["INVALID_STATUS", "UNAUTHORIZED", "LEGACY_BOOKING", "INVALID_FORMAT"]) {
      rpc.mockResolvedValue(ok({ success: false, code }));
      expect((await verifyStartOtp(B, OTP)) as { code: string }).toMatchObject({ code });
    }
    rpc.mockResolvedValue(ok({ success: false, code: "WHATEVER" }));
    expect(await verifyStartOtp(B, OTP)).toEqual({ ok: false, code: "INTERNAL" });
  });

  it("requires exactly 4 digits; no server call otherwise", async () => {
    for (const bad of ["123", "12345", "12a4", ""]) {
      expect(await verifyStartOtp(B, bad)).toEqual({ ok: false, code: "INVALID_FORMAT" });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("no session → UNAUTHORIZED without calling server", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await verifyStartOtp(B, OTP)).toEqual({ ok: false, code: "UNAUTHORIZED" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("RPC error / throw → safe failure, never success", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "x" }, status: 500 });
    expect(await verifyStartOtp(B, OTP)).toEqual({ ok: false, code: "INTERNAL" });
    rpc.mockRejectedValue(new Error("offline"));
    expect(await verifyStartOtp(B, OTP)).toEqual({ ok: false, code: "NETWORK" });
  });

  it("duplicate taps share one request", async () => {
    let resolve!: (v: unknown) => void;
    rpc.mockReturnValue(new Promise((r) => (resolve = r)));
    const a = verifyStartOtp(B, OTP);
    const b = verifyStartOtp(B, OTP);
    resolve(ok({ success: true }));
    expect(await a).toEqual(await b);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("9. the OTP is never logged", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
    rpc.mockResolvedValue(ok({ success: false, code: "WRONG_CODE", attempts_left: 2 }));
    await verifyStartOtp(B, OTP);
    for (const s of spies) {
      expect(JSON.stringify(s.mock.calls)).not.toContain(OTP);
      s.mockRestore();
    }
    expect(JSON.stringify(localStorage)).not.toContain(OTP);
  });
});
