import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
const getSession = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    auth: { getSession: (...a: unknown[]) => getSession(...a) },
  },
}));

import {
  verifyStartOtp,
  startOtpMessage,
  canShowStartButton,
  isStartOtpWorkerEnabled,
  START_OTP_WORKER_ENABLED_DEFAULT,
  __resetStartOtpState,
} from "@/lib/startOtp";

const B = "b-1";
const OTP = "0427";
const httpErr = (status: number, payload?: unknown) => ({
  data: null,
  error: { name: "FunctionsHttpError", message: "x", context: new Response(JSON.stringify(payload ?? {}), { status }) },
});

beforeEach(() => {
  invoke.mockReset();
  getSession.mockReset();
  getSession.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
  localStorage.clear();
  __resetStartOtpState();
});

describe("Start OTP (4-digit)", () => {
  it("switch is off by default and needs no server call", () => {
    expect(START_OTP_WORKER_ENABLED_DEFAULT).toBe(false);
    expect(isStartOtpWorkerEnabled()).toBe(false);
    expect(canShowStartButton(false, "assigned")).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("start button only for allowed statuses", () => {
    for (const s of ["assigned", "accepted", "confirmed", "on_the_way", "reached"]) expect(canShowStartButton(true, s)).toBe(true);
    for (const s of ["started", "completed", "cancelled", "pending"]) expect(canShowStartButton(true, s)).toBe(false);
  });

  it("requires exactly 4 digits and never calls server otherwise", async () => {
    for (const bad of ["123", "12345", "12a4", ""]) {
      expect(await verifyStartOtp(B, bad)).toEqual({ ok: false, code: "INVALID_REQUEST" });
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it("sends only booking_id and otp (no worker_id)", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await verifyStartOtp(B, OTP)).toEqual({ ok: true, idempotent: false });
    expect(invoke).toHaveBeenCalledWith("verify-start-otp", { body: { booking_id: B, otp: OTP } });
  });

  it("idempotent success counts as success", async () => {
    invoke.mockResolvedValue({ data: { ok: true, idempotent: true }, error: null });
    expect(await verifyStartOtp(B, OTP)).toEqual({ ok: true, idempotent: true });
  });

  it("200 without ok:true is not success", async () => {
    invoke.mockResolvedValue({ data: { ok: false }, error: null });
    expect((await verifyStartOtp(B, OTP)).ok).toBe(false);
  });

  it.each([
    [422, "INCORRECT_OTP", "Incorrect code. Ask the customer for the 4-digit Start OTP."],
    [423, "LOCKED", "Too many wrong tries. Please call support."],
    [409, "NOT_AVAILABLE", "This booking can't be started now. It may be cancelled or reassigned."],
    [403, "NOT_ASSIGNED", "This booking is not assigned to you."],
    [500, "INTERNAL", "Couldn't check the code. Please try again."],
  ])("HTTP %i → %s", async (status, code, msg) => {
    invoke.mockResolvedValue(httpErr(status));
    const r = await verifyStartOtp(B, OTP);
    expect(r).toEqual({ ok: false, code });
    expect(startOtpMessage(code as never)).toBe(msg);
  });

  it("network failure → retry message", async () => {
    invoke.mockRejectedValue(new TypeError("fetch failed"));
    const r = await verifyStartOtp(B, OTP);
    expect(r).toEqual({ ok: false, code: "NETWORK" });
    expect(startOtpMessage("NETWORK")).toBe("Couldn't check the code. Please try again.");
  });

  it("no session → no call", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await verifyStartOtp(B, OTP)).toEqual({ ok: false, code: "UNAUTHENTICATED" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("double submit shares one request", async () => {
    let release!: (v: unknown) => void;
    invoke.mockReturnValue(new Promise((r) => (release = r)));
    const a = verifyStartOtp(B, OTP);
    const b = verifyStartOtp(B, OTP);
    await Promise.resolve(); await Promise.resolve();
    release({ data: { ok: true }, error: null });
    expect(await a).toEqual(await b);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("OTP never written to console or storage", async () => {
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    invoke.mockResolvedValue(httpErr(422));
    await verifyStartOtp(B, OTP);
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await verifyStartOtp(B, OTP);
    const all = [...spies.flatMap((s) => s.mock.calls), ...setItem.mock.calls].flat().map(String).join(" ");
    expect(all).not.toContain(OTP);
    spies.forEach((s) => s.mockRestore());
    setItem.mockRestore();
  });
});
