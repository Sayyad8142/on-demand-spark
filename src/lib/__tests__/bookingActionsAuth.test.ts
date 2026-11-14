import { describe, it, expect, vi, beforeEach } from "vitest";

const state: any = {};
vi.mock("@/lib/bookingAck", () => ({ ackBookingDelivery: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/scheduledBookingGuards", () => ({
  canShowWorkerBookingOffer: () => true,
  isBeforeScheduledDispatchWindow: () => false,
  logScheduledOfferDecision: () => {},
}));
vi.mock("@/integrations/supabase/client", () => {
  const q: any = { select: () => q, eq: vi.fn(() => q), gt: () => q, maybeSingle: async () => ({ data: state.table === "workers" ? { id: "own-worker" } : state.table === "booking_requests" ? state.offer : null, error: state.table === "booking_requests" ? state.readError : null }) };
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: state.session }, error: null }),
        refreshSession: vi.fn(async () => state.refreshResult ?? { error: null }),
      },
      from: (table: string) => { state.table = table; state.query = q; return q; },
      rpc: vi.fn(async (name: string, args: any) => state.rpc(name, args)),
      functions: { invoke: vi.fn(async () => ({})) },
    },
  };
});

import { tryAccept, rejectBooking } from "@/lib/bookingActions";
import { supabase } from "@/integrations/supabase/client";

const future = () => Math.floor(Date.now() / 1000) + 3600;

beforeEach(() => {
  vi.clearAllMocks();
  state.session = { expires_at: future(), user: { id: "own-login" } };
  state.offer = { id: "own-request", status: "pending", timeout_at: new Date(Date.now() + 60_000).toISOString() };
  state.readError = null;
  state.refreshResult = undefined;
  state.rpc = async () => ({ data: { success: true, confirmed: true }, error: null });
});

describe("Worker App accept/reject identity handling", () => {
  it("preflight is restricted to the logged-in worker, not the caller worker", async () => {
    await tryAccept("b1", "attacker");
    expect(state.query.eq).toHaveBeenCalledWith("user_id", "own-login");
    expect(state.query.eq).toHaveBeenCalledWith("worker_id", "own-worker");
    expect(state.query.eq).not.toHaveBeenCalledWith("worker_id", "attacker");
  });
  it("missing own offer blocks Accept", async () => {
    state.offer = null;
    expect(await tryAccept("b1")).toEqual({ success: false, error: "not-offered" });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it("authoritative deadline blocks an expired Accept", async () => {
    state.offer.timeout_at = new Date(Date.now() - 1000).toISOString();
    expect((await tryAccept("b1")).error).toBe("offer-expired");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it("closed own row cannot pass preflight", async () => {
    state.offer.status = "timed_out";
    expect((await tryAccept("b1")).error).toBe("not-offered");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it("read failure is retryable and never sends Accept", async () => {
    state.readError = { message: "network" };
    expect((await tryAccept("b1")).error).toBe("Unable to check offer. Please try again.");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it("confirmed rejection never calls a dispatcher even when server requests escalation", async () => {
    state.rpc = async () => ({ data: { success: true, confirmed: true, should_notify: true, next_tier: 2 }, error: null });
    expect(await rejectBooking("b1")).toEqual({ success: true, shouldNotify: false });
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
  it("1. own offer: sends only the booking id, never a worker id", async () => {
    const r = await tryAccept("b1", "attacker-worker-id");
    expect(r.success).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("try_accept_booking", { p_booking_id: "b1" });
  });

  it("2. another worker's offer: server refusal is surfaced, not success", async () => {
    state.rpc = async () => ({ data: { success: false, error: "Offer not assigned to you" }, error: null });
    expect((await tryAccept("b1")).success).toBe(false);
  });

  it("3. missing session: no request is sent", async () => {
    state.session = null;
    expect((await tryAccept("b1")).success).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("4/5. expiring session is refreshed before accepting", async () => {
    state.session = { expires_at: Math.floor(Date.now() / 1000) + 30, user: { id: "own-login" } };
    await tryAccept("b1");
    expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalled();
  });

  it("4. failed refresh (reopened after hours, refresh token dead) blocks the request", async () => {
    state.session = { expires_at: Math.floor(Date.now() / 1000) - 7200 };
    state.refreshResult = { error: { message: "invalid refresh token" } };
    expect((await tryAccept("b1")).success).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("6. expired offer on reject is reported as gone, not rejected", async () => {
    state.rpc = async () => ({ data: { success: false, error: "offer-expired" }, error: null });
    const r = await rejectBooking("b1", "someone-else");
    expect(r.success).toBe(false);
    expect(r.offerGone).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("reject_booking_offer", { p_booking_id: "b1" });
  });

  it("9. duplicate accept: second answer from server is respected", async () => {
    let n = 0;
    state.rpc = async () => ({ data: n++ === 0 ? { success: true } : { success: false, error: "already accepted" }, error: null });
    expect((await tryAccept("b1")).success).toBe(true);
    expect((await tryAccept("b1")).success).toBe(false);
  });

  it("10. network error is reported as failure, never success", async () => {
    state.rpc = async () => ({ data: null, error: { message: "Failed to fetch" } });
    expect((await tryAccept("b1")).success).toBe(false);
    expect((await rejectBooking("b1")).success).toBe(false);
  });

  it("4. JWT expired mid-reject: refresh once and retry", async () => {
    let n = 0;
    state.rpc = async () => (n++ === 0 ? { data: null, error: { message: "JWT expired" } } : { data: { success: true, confirmed: true }, error: null });
    expect((await rejectBooking("b1")).success).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });
});
