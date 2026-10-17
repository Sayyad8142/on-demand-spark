import { describe, it, expect, vi, beforeEach } from "vitest";

const state: any = {};
vi.mock("@/lib/bookingAck", () => ({ ackBookingDelivery: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/scheduledBookingGuards", () => ({
  canShowWorkerBookingOffer: () => true,
  isBeforeScheduledDispatchWindow: () => false,
  logScheduledOfferDecision: () => {},
}));
vi.mock("@/integrations/supabase/client", () => {
  const q: any = { select: () => q, eq: () => q, gt: () => q, maybeSingle: async () => ({ data: null }) };
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: state.session }, error: null }),
        refreshSession: vi.fn(async () => state.refreshResult ?? { error: null }),
      },
      from: () => q,
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
  state.session = { expires_at: future() };
  state.refreshResult = undefined;
  state.rpc = async () => ({ data: { success: true, confirmed: true }, error: null });
});

describe("Worker App accept/reject identity handling", () => {
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
    state.session = { expires_at: Math.floor(Date.now() / 1000) + 30 };
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
