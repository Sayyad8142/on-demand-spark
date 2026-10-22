import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
const getSession = vi.fn();
const refreshSession = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    auth: {
      getSession: (...a: unknown[]) => getSession(...a),
      refreshSession: (...a: unknown[]) => refreshSession(...a),
      getUser: vi.fn(async () => ({ data: { user: null } })),
    },
    from: vi.fn(),
  },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "android", isNativePlatform: () => true } }));
vi.mock("@/config/version", () => ({ CURRENT_VERSION_NAME: "test" }));

import { ackBookingDelivery, jwtUsable, resetAckCache, sessionFallbackAllowed } from "@/lib/bookingAck";

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "");
const jwt = (expSec: number) => `h.${b64({ exp: expSec, sub: "u1" })}.s`;
const now = () => Math.floor(Date.now() / 1000);
const VALID_LOGIN = jwt(now() + 3600);
const EXPIRED_LOGIN = jwt(now() - 10);
const ACK_TOKEN = jwt(now() + 120);
const err = (status: number) => ({ data: null, error: { message: `http ${status}`, context: { status } } });
const ok = { data: { ok: true }, error: null };
const session = (t: string | null) => ({ data: { session: t ? { access_token: t, user: { id: "u1" } } : null } });

beforeEach(() => {
  invoke.mockReset(); getSession.mockReset(); refreshSession.mockReset(); resetAckCache();
  localStorage.setItem("didi_worker_id", "phone-claimed-worker");
});

describe("session fallback rules", () => {
  it("only refused token ACKs for delivery events qualify", () => {
    expect(sessionFallbackAllowed({ event: "push_received", status: 401, sentToken: true })).toBe(true);
    expect(sessionFallbackAllowed({ event: "popup_shown", status: 403, sentToken: true })).toBe(true);
    expect(sessionFallbackAllowed({ event: "worker_seen", status: 401, sentToken: true })).toBe(true);
    expect(sessionFallbackAllowed({ event: "accept_tapped", status: 401, sentToken: true })).toBe(false);
    expect(sessionFallbackAllowed({ event: "reject_tapped", status: 401, sentToken: true })).toBe(false);
    expect(sessionFallbackAllowed({ event: "push_received", status: 500, sentToken: true })).toBe(false);
    expect(sessionFallbackAllowed({ event: "push_received", status: 401, sentToken: false })).toBe(false);
  });
  it("login usable only before expiry minus 30 s", () => {
    expect(jwtUsable(VALID_LOGIN)).toBe(true);
    expect(jwtUsable(EXPIRED_LOGIN)).toBe(false);
    expect(jwtUsable(jwt(now() + 10))).toBe(false);
    expect(jwtUsable("garbage")).toBe(false);
    expect(jwtUsable(null)).toBe(false);
  });
});

describe("ackBookingDelivery with login fallback", () => {
  it("valid ack_token: one request, token kept, no fallback", async () => {
    getSession.mockResolvedValue(session(VALID_LOGIN));
    invoke.mockResolvedValue(ok);
    await ackBookingDelivery({ bookingId: "b1", bookingRequestId: "r1", event: "push_received", ackToken: ACK_TOKEN });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1].body.ack_token).toBe(ACK_TOKEN);
  });
  it("missing token + valid login: sent once via login", async () => {
    getSession.mockResolvedValue(session(VALID_LOGIN));
    invoke.mockResolvedValue(ok);
    await ackBookingDelivery({ bookingId: "b1", bookingRequestId: "r1", event: "popup_shown" });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1].body.ack_token).toBeUndefined();
  });
  it("missing token + expired login: refreshed before sending", async () => {
    getSession.mockResolvedValue(session(EXPIRED_LOGIN));
    refreshSession.mockResolvedValue({ data: { session: { access_token: VALID_LOGIN } }, error: null });
    invoke.mockResolvedValue(ok);
    await ackBookingDelivery({ bookingId: "b1", event: "worker_seen" });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it("refused token (expired/invalid) + valid login: one retry without token or worker_id", async () => {
    getSession.mockResolvedValue(session(VALID_LOGIN));
    invoke.mockResolvedValueOnce(err(401)).mockResolvedValueOnce(ok);
    await ackBookingDelivery({ bookingId: "b1", bookingRequestId: "r1", event: "push_received", ackToken: ACK_TOKEN });
    expect(invoke).toHaveBeenCalledTimes(2);
    const fb = invoke.mock.calls[1][1].body;
    expect(fb.ack_token).toBeUndefined();
    expect(fb.worker_id).toBeUndefined(); // phone-claimed id is never the proof
    expect(fb.event_type).toBe("push_received");
  });
  it("refused token + invalid login (refresh fails): no fallback request, later retry allowed", async () => {
    getSession.mockResolvedValue(session(EXPIRED_LOGIN));
    refreshSession.mockResolvedValue({ data: { session: null }, error: { message: "invalid" } });
    invoke.mockResolvedValue(err(401));
    await ackBookingDelivery({ bookingId: "b1", bookingRequestId: "r1", event: "popup_shown", ackToken: ACK_TOKEN });
    expect(invoke).toHaveBeenCalledTimes(1);
    await ackBookingDelivery({ bookingId: "b1", bookingRequestId: "r1", event: "popup_shown", ackToken: ACK_TOKEN });
    expect(invoke).toHaveBeenCalledTimes(2); // not marked done
  });
  it("logged out: no login, no fallback", async () => {
    getSession.mockResolvedValue(session(null));
    invoke.mockResolvedValue(err(401));
    await ackBookingDelivery({ bookingId: "b1", event: "push_received", ackToken: ACK_TOKEN });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it("Accept/Reject taps are never re-sent through the fallback", async () => {
    getSession.mockResolvedValue(session(VALID_LOGIN));
    invoke.mockResolvedValue(err(401));
    await ackBookingDelivery({ bookingId: "b1", event: "accept_tapped", ackToken: ACK_TOKEN });
    await ackBookingDelivery({ bookingId: "b2", event: "reject_tapped", ackToken: ACK_TOKEN });
    expect(invoke).toHaveBeenCalledTimes(2);
  });
  it("fallback also refused: at most 2 requests, no loop", async () => {
    getSession.mockResolvedValue(session(VALID_LOGIN));
    invoke.mockResolvedValue(err(403));
    await ackBookingDelivery({ bookingId: "b1", event: "worker_seen", ackToken: ACK_TOKEN });
    expect(invoke).toHaveBeenCalledTimes(2);
  });
  it("duplicate confirmation after success is not sent again", async () => {
    getSession.mockResolvedValue(session(VALID_LOGIN));
    invoke.mockResolvedValueOnce(err(401)).mockResolvedValue(ok);
    await ackBookingDelivery({ bookingId: "b1", bookingRequestId: "r1", event: "push_received", ackToken: ACK_TOKEN });
    await ackBookingDelivery({ bookingId: "b1", bookingRequestId: "r1", event: "push_received", ackToken: ACK_TOKEN });
    expect(invoke).toHaveBeenCalledTimes(2);
  });
  it("offline then back online: network failure is retried by a later event, then succeeds once", async () => {
    getSession.mockResolvedValue(session(VALID_LOGIN));
    invoke.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(ok);
    await ackBookingDelivery({ bookingId: "b1", event: "popup_shown" });
    await ackBookingDelivery({ bookingId: "b1", event: "popup_shown" });
    await ackBookingDelivery({ bookingId: "b1", event: "popup_shown" });
    expect(invoke).toHaveBeenCalledTimes(2);
  });
  it("no login token or ack_token appears in logs", async () => {
    const spy = [vi.spyOn(console, "log"), vi.spyOn(console, "warn")];
    getSession.mockResolvedValue(session(VALID_LOGIN));
    invoke.mockResolvedValueOnce(err(401)).mockResolvedValueOnce(ok);
    await ackBookingDelivery({ bookingId: "b1", event: "push_received", ackToken: ACK_TOKEN });
    const out = spy.flatMap((s) => s.mock.calls.flat().map(String)).join(" ");
    expect(out).not.toContain(VALID_LOGIN);
    expect(out).not.toContain(ACK_TOKEN);
    spy.forEach((s) => s.mockRestore());
  });
});
