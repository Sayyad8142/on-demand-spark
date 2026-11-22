import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ rpc: vi.fn(), own: vi.fn(), done: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: h.rpc,
  from: () => {
    const q = { select: () => q, eq: () => q, gte: () => q, limit: h.done, in: h.own };
    return q;
  },
} }));
import { useHomeToday } from "../useHomeToday";
const rows = [
  { booking_id: "mine", status: "assigned", scheduled_date: "2026-11-22", scheduled_time: "10:30" },
  { booking_id: "unowned", status: "confirmed", scheduled_date: "2026-11-22", scheduled_time: "10:00" },
];
beforeEach(() => {
  h.rpc.mockReset(); h.own.mockReset(); h.done.mockReset();
  h.rpc.mockResolvedValue({ data: rows, error: null });
  h.own.mockResolvedValue({ data: [{ id: "mine" }], error: null });
  h.done.mockResolvedValue({ data: [], error: null });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});
describe("Home next job ownership", () => {
  it("shows only the server-confirmed own booking from community-wide results", async () => {
    const hook = renderHook(() => useHomeToday("worker-one"));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.upcoming?.map(r => r.booking_id)).toEqual(["mine"]);
    expect(h.own).toHaveBeenCalledWith("id", ["mine", "unowned"]);
    hook.unmount();
  });
  it("hides previous assigned-job display when fresh ownership verification fails", async () => {
    const hook = renderHook(() => useHomeToday("worker-one"));
    await waitFor(() => expect(hook.result.current.upcoming).toHaveLength(1));
    h.own.mockResolvedValue({ data: null, error: Error("offline") });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(hook.result.current.upcoming).toBeNull());
    hook.unmount();
  });
  it("never shows the previous account's job while a different account loads", async () => {
    const hook = renderHook(({ id }) => useHomeToday(id), { initialProps: { id: "worker-one" } });
    await waitFor(() => expect(hook.result.current.upcoming).toHaveLength(1));
    h.rpc.mockImplementation(() => new Promise(() => undefined));
    hook.rerender({ id: "worker-two" });
    expect(hook.result.current.upcoming).toBeNull();
    hook.unmount();
  });
});