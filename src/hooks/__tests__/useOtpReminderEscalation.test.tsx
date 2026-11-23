import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOtpReminderEscalation } from "../useOtpReminderEscalation";

const mocks = vi.hoisted(() => ({
  rows: [] as { id: string; status: string; accepted_at: string; otp_verified_at: string | null; start_otp_required: boolean; started_at: string | null }[],
  statuses: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => ({ select: () => ({ eq: () => table === "workers"
    ? { maybeSingle: async () => ({ data: { id: "worker" } }) }
    : { in: (_column: string, statuses: string[]) => {
      mocks.statuses(statuses);
      return { limit: async () => ({ data: mocks.rows, error: null }) };
    } } }) }),
  rpc: mocks.rpc,
} }));

const now = Date.parse("2026-11-23T06:00:00Z");
const oldJob = { id: "old", status: "started", accepted_at: new Date(now - 70 * 60_000).toISOString(),
  otp_verified_at: null, start_otp_required: true, started_at: new Date(now - 60 * 60_000).toISOString() };
const pendingJob = { ...oldJob, id: "new", status: "assigned", start_otp_required: true, started_at: null };

describe("completion reminder yields across the worker's jobs", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(now); vi.clearAllMocks(); localStorage.clear();
    mocks.rows = [];
  });
  afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

  it("does not play completion speech while a different assigned Start OTP is pending", async () => {
    mocks.rows = [oldJob, pendingJob];
    const alert = vi.fn(); window.addEventListener("otpReminderAlert", alert);
    const { result, unmount } = renderHook(() => useOtpReminderEscalation("user"));
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(mocks.statuses).toHaveBeenCalledWith(expect.arrayContaining(["assigned", "started"]));
      expect(alert).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(result.current.pendingBookings).toEqual([]);
    } finally { unmount(); window.removeEventListener("otpReminderAlert", alert); }
  });

  it("allows the existing 60-minute completion reminder after the other Start is verified", async () => {
    mocks.rows = [oldJob, { ...pendingJob, status: "started", accepted_at: new Date(now - 10 * 60_000).toISOString(), started_at: new Date(now).toISOString() }];
    const alert = vi.fn(); window.addEventListener("otpReminderAlert", alert);
    const { result, unmount } = renderHook(() => useOtpReminderEscalation("user"));
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(alert).toHaveBeenCalledTimes(1);
      expect((alert.mock.calls[0][0] as CustomEvent).detail.bookingId).toBe("old");
      expect(result.current.pendingBookings.map(b => b.id)).toEqual(["old"]);
    } finally { unmount(); window.removeEventListener("otpReminderAlert", alert); }
  });
});