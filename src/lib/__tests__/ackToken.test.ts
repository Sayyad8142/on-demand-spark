import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      getUser: vi.fn(async () => ({ data: { user: null } })),
    },
    from: vi.fn(),
  },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "android", isNativePlatform: () => true } }));
vi.mock("@/config/version", () => ({ CURRENT_VERSION_NAME: "test" }));

import {
  ackBookingDelivery, buildAckBody, extractAckToken, rememberAckToken, resetAckCache,
} from "@/lib/bookingAck";

const TOKEN = "v1.eyJyIjoiYSJ9.c2ln";

/** Mirror of BackendSync.classifyAckHttp (Kotlin) — keep in sync. */
function classify(code: number, hasToken: boolean) {
  if (code >= 200 && code < 300) return "OK";
  if (code === 401 || code === 403) return "REJECTED";
  if (code === 408 || code === 429) return "RETRY";
  if (code >= 400 && code < 500) return "REJECTED";
  return "RETRY";
}

beforeEach(() => { invoke.mockReset(); resetAckCache(); });

describe("signed ack token", () => {
  it("valid token is echoed unchanged in the body", () => {
    const b = buildAckBody({ bookingId: "b1", bookingRequestId: "r1", event: "push_received", ackToken: TOKEN });
    expect(b.ack_token).toBe(TOKEN);
  });
  it("missing token: no ack_token field, ACK still sent via session path", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await ackBookingDelivery({ bookingId: "b1", event: "push_received" });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1].body.ack_token).toBeUndefined();
  });
  it("garbage/oversized tokens are not forwarded", () => {
    expect(extractAckToken({ ack_token: 123 })).toBeNull();
    expect(extractAckToken({ ack_token: "x".repeat(3000) })).toBeNull();
    expect(extractAckToken({ ack_token: TOKEN })).toBe(TOKEN);
  });
  it("remembered push token is attached to later popup ACKs", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    rememberAckToken({ bookingId: "b1", bookingRequestId: "r1", ackToken: TOKEN });
    await ackBookingDelivery({ bookingId: "b1", bookingRequestId: "r1", event: "popup_shown" });
    expect(invoke.mock.calls[0][1].body.ack_token).toBe(TOKEN);
  });
  it("duplicate ACK is sent once", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await ackBookingDelivery({ bookingId: "b1", event: "popup_shown", ackToken: TOKEN });
    await ackBookingDelivery({ bookingId: "b1", event: "popup_shown", ackToken: TOKEN });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it("rejected (invalid/expired token) is not cached as success", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: "401" } });
    await ackBookingDelivery({ bookingId: "b1", event: "popup_shown", ackToken: TOKEN });
    invoke.mockResolvedValueOnce({ data: {}, error: null });
    await ackBookingDelivery({ bookingId: "b1", event: "popup_shown", ackToken: TOKEN });
    expect(invoke).toHaveBeenCalledTimes(2);
  });
  it("network timeout is not success", async () => {
    invoke.mockRejectedValueOnce(new Error("timeout"));
    await ackBookingDelivery({ bookingId: "b2", event: "push_received", ackToken: TOKEN });
    invoke.mockResolvedValueOnce({ data: {}, error: null });
    await ackBookingDelivery({ bookingId: "b2", event: "push_received", ackToken: TOKEN });
    expect(invoke).toHaveBeenCalledTimes(2);
  });
  it("token is never written to console", async () => {
    const spies = ["log", "warn", "error"].map((m) => vi.spyOn(console, m as "log"));
    invoke.mockResolvedValue({ data: null, error: { message: "403" } });
    await ackBookingDelivery({ bookingId: "b3", event: "push_received", ackToken: TOKEN });
    for (const s of spies) for (const c of s.mock.calls) expect(JSON.stringify(c)).not.toContain(TOKEN);
  });
  it("native HTTP classification: 400/401/403 never success", () => {
    expect(classify(200, true)).toBe("OK");
    expect(classify(400, true)).toBe("REJECTED");
    expect(classify(401, true)).toBe("REJECTED");
    expect(classify(403, true)).toBe("REJECTED");
    expect(classify(401, false)).toBe("REJECTED");
    expect(classify(403, false)).toBe("REJECTED");
    expect(classify(503, true)).toBe("RETRY");
  });
});

describe("Phase 1 compatibility gaps", () => {
  it("token remembered by request id is recalled by booking id alone", async () => {
    const m = await import("@/lib/bookingAck");
    m.resetAckCache();
    m.rememberAckToken({ bookingId: "b-9", bookingRequestId: "r-9", ackToken: "v1.x.y" });
    expect(m.recallAckToken("b-9")).toBe("v1.x.y");
  });
  it("logout reset clears remembered tokens", async () => {
    const m = await import("@/lib/bookingAck");
    m.rememberAckToken({ bookingId: "b-8", ackToken: "v1.a.b" });
    m.resetAckCache();
    expect(m.recallAckToken("b-8")).toBeNull();
  });
});

const tok = (exp: number, tag = "s") =>
  `v1.${btoa(JSON.stringify({ r: "r", w: "w", b: "b", exp })).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.${tag}`;
const future = () => Math.floor(Date.now() / 1000) + 600;

describe("Phase 1 build readiness: alias + expiry", () => {
  it("two successive offers for one booking: alias resolves to newest, exact ids stay separate", async () => {
    const m = await import("@/lib/bookingAck");
    m.resetAckCache();
    const t1 = tok(future(), "one"), t2 = tok(future(), "two");
    m.rememberAckToken({ bookingId: "B", bookingRequestId: "R1", ackToken: t1 });
    m.rememberAckToken({ bookingId: "B", bookingRequestId: "R2", ackToken: t2 });
    expect(m.recallAckToken("B")).toBe(t2);
    expect(m.recallAckToken("B", "R1")).toBe(t1); // delayed event from old offer uses its own token
    expect(m.recallAckToken("B", "R2")).toBe(t2);
  });
  it("unknown request id never falls back to the booking alias", async () => {
    const m = await import("@/lib/bookingAck");
    m.resetAckCache();
    m.rememberAckToken({ bookingId: "B", bookingRequestId: "R1", ackToken: tok(future()) });
    expect(m.recallAckToken("B", "R-other")).toBeNull();
  });
  it("request id belonging to another booking does not resolve", async () => {
    const m = await import("@/lib/bookingAck");
    m.resetAckCache();
    m.rememberAckToken({ bookingId: "B", bookingRequestId: "R1", ackToken: tok(future()) });
    expect(m.recallAckToken("C", "R1")).toBeNull();
  });
  it("reassignment (offer cleared) removes token and alias", async () => {
    const m = await import("@/lib/bookingAck");
    m.resetAckCache();
    m.rememberAckToken({ bookingId: "B", bookingRequestId: "R1", ackToken: tok(future()) });
    m.forgetAckToken("B", "R1");
    expect(m.recallAckToken("B")).toBeNull();
    expect(m.recallAckToken("B", "R1")).toBeNull();
  });
  it("expired token is never reused", async () => {
    const m = await import("@/lib/bookingAck");
    m.resetAckCache();
    m.rememberAckToken({ bookingId: "B", bookingRequestId: "R1", ackToken: tok(Math.floor(Date.now() / 1000) - 5) });
    expect(m.recallAckToken("B", "R1")).toBeNull();
  });
  it("account switch clears exact entries and aliases", async () => {
    const m = await import("@/lib/bookingAck");
    m.rememberAckToken({ bookingId: "B", bookingRequestId: "R1", ackToken: tok(future()) });
    m.resetAckCache();
    expect(m.recallAckToken("B")).toBeNull();
    expect(m.recallAckToken("B", "R1")).toBeNull();
  });
});

