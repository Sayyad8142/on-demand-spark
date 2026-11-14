import { describe, it, expect, vi, beforeEach } from "vitest";

const state: any = {};
vi.mock("@/lib/bookingAck", () => ({ ackBookingDelivery: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/scheduledBookingGuards", () => ({
  canShowWorkerBookingOffer: () => true,
  isBeforeScheduledDispatchWindow: () => false,
  logScheduledOfferDecision: () => {},
}));
vi.mock("@/integrations/supabase/client", () => {
  const q: any = { select: () => q, eq: () => q, gt: () => q, maybeSingle: async () => ({ data: state.table === "workers" ? { id: "own-worker" } : state.table === "booking_requests" ? { id: "r1", status: "pending", timeout_at: new Date(Date.now() + 60_000).toISOString() } : null }) };
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: "own-login" }, expires_at: Math.floor(Date.now() / 1000) + 3600 } }, error: null }),
        refreshSession: vi.fn(async () => ({ error: null })),
      },
      from: (table: string) => { state.table = table; return q; },
      rpc: vi.fn(async (name: string, args: any) => state.rpc(name, args)),
      functions: { invoke: vi.fn(async () => ({})) },
    },
  };
});

import { tryAccept } from "@/lib/bookingActions";
import { isAcceptanceClosedError, ACCEPTANCE_CLOSED_MESSAGE } from "@/lib/acceptanceClosed";
import { supabase } from "@/integrations/supabase/client";

const closedErr = { code: "P0001", message: "BOOKING_ACCEPTANCE_CLOSED: outside 07:00-19:00 IST" };

beforeEach(() => {
  vi.clearAllMocks();
  state.rpc = async () => ({ data: null, error: closedErr });
});

describe("Booking acceptance after 7 PM", () => {
  it("recognises only P0001 with the BOOKING_ACCEPTANCE_CLOSED: prefix", () => {
    expect(isAcceptanceClosedError(closedErr)).toBe(true);
    expect(isAcceptanceClosedError({ code: "P0002", message: closedErr.message })).toBe(false);
    expect(isAcceptanceClosedError({ code: "P0001", message: "booking-already-accepted" })).toBe(false);
    expect(isAcceptanceClosedError(null)).toBe(false);
  });

  it("shows the exact closed message and flags acceptanceClosed", async () => {
    const r = await tryAccept("b1");
    expect(r).toEqual({
      success: false,
      acceptanceClosed: true,
      error: "Booking acceptance is closed. Didi Now operates from 7:00 AM to 7:00 PM.",
    });
    expect(ACCEPTANCE_CLOSED_MESSAGE).toBe(r.error);
  });

  it("never retries the acceptance", async () => {
    await tryAccept("b1");
    const acceptCalls = (supabase.rpc as any).mock.calls.filter((c: any[]) => c[0] === "try_accept_booking");
    expect(acceptCalls).toHaveLength(1);
  });

  it("other errors are not treated as closed", async () => {
    state.rpc = async () => ({ data: null, error: { code: "08006", message: "network" } });
    const r = await tryAccept("b1");
    expect(r.acceptanceClosed).toBeUndefined();
    expect(r.success).toBe(false);
  });
});
