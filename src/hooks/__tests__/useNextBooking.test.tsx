import { act, renderHook } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ invoke: vi.fn(), session: vi.fn(), native: null as null | ((s: { isActive: boolean }) => void) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: h.session }, functions: { invoke: h.invoke } } }));
vi.mock("@capacitor/app", () => ({ App: { addListener: async (_: string, cb: typeof h.native) => { h.native = cb; return { remove: vi.fn() }; } } }));
import { useNextBooking } from "../useNextBooking";
const now = Date.parse("2026-11-12T08:40:00Z");
const response = () => ({ data: { version: 1, updatedAt: new Date(Date.now()).toISOString(), slotStart: new Date(Math.floor(Date.now() / 1800000) * 1800000).toISOString(), slotEnd: new Date(Math.floor(Date.now() / 1800000) * 1800000 + 1800000).toISOString(), community: "c", service: "maid", communities: ["c"], services: ["maid"], reason: "available", rows: [{ rank: 1, name: "Test", priority: 80, rating: 4.5, isMe: true }] }, error: null });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); h.invoke.mockReset(); h.session.mockReset(); h.native = null;
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  h.session.mockResolvedValue({ data: { session: { user: { id: "u1" }, access_token: "test-only" } } });
  h.invoke.mockImplementation(async () => response());
});
afterEach(() => { vi.useRealTimers(); });
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
describe("Next Booking refresh safety", () => {
  it("does not contact any API when production integration is disabled", async () => { const hook = renderHook(() => useNextBooking("u1", "", "")); await flush(); expect(h.session).not.toHaveBeenCalled(); expect(h.invoke).not.toHaveBeenCalled(); hook.unmount(); });
  it("refreshes at 15 seconds and stops on unmount", async () => { const hook = renderHook(() => useNextBooking("u1", "", "", true)); await flush(); expect(h.invoke).toHaveBeenCalledTimes(1); await act(async () => { await vi.advanceTimersByTimeAsync(15000); }); expect(h.invoke).toHaveBeenCalledTimes(2); hook.unmount(); await act(async () => { await vi.advanceTimersByTimeAsync(30000); }); expect(h.invoke).toHaveBeenCalledTimes(2); });
  it("stops hidden polling and refreshes on foreground", async () => {
    const hook = renderHook(() => useNextBooking("u1", "", "", true)); await flush();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(hook.result.current.data).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(45000); }); expect(h.invoke).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); }); await flush(); expect(h.invoke).toHaveBeenCalledTimes(2); hook.unmount();
  });
  it("native background stops polling and native foreground refreshes", async () => {
    const hook = renderHook(() => useNextBooking("u1", "", "", true)); await flush(); act(() => h.native?.({ isActive: false }));
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); }); expect(h.invoke).toHaveBeenCalledTimes(1);
    act(() => h.native?.({ isActive: true })); await flush(); expect(h.invoke).toHaveBeenCalledTimes(2); hook.unmount();
  });
  it("availability changes refresh immediately", async () => { const hook = renderHook(() => useNextBooking("u1", "", "", true)); await flush(); act(() => window.dispatchEvent(new Event("availabilityChanged"))); await flush(); expect(h.invoke).toHaveBeenCalledTimes(2); hook.unmount(); });
  it("refreshes exactly at the new slot", async () => { vi.setSystemTime(Date.parse("2026-11-12T08:59:59Z")); const hook = renderHook(() => useNextBooking("u1", "", "", true)); await flush(); await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); expect(h.invoke).toHaveBeenCalledTimes(2); expect(hook.result.current.data?.slotStart).toBe("2026-11-12T09:00:00.000Z"); hook.unmount(); });
  it("clears data on network failure", async () => { const hook = renderHook(() => useNextBooking("u1", "", "", true)); await flush(); expect(hook.result.current.data).not.toBeNull(); h.invoke.mockResolvedValue({ data: null, error: Error("offline") }); await act(async () => { await vi.advanceTimersByTimeAsync(15000); }); expect(hook.result.current.data).toBeNull(); hook.unmount(); });
  it("clears account data and refuses a mismatched login", async () => { const hook = renderHook(({ account }) => useNextBooking(account, "", "", true), { initialProps: { account: "u1" } }); await flush(); hook.rerender({ account: "u2" }); expect(hook.result.current.data).toBeNull(); await flush(); expect(h.invoke).toHaveBeenCalledTimes(1); hook.unmount(); });
  it("late responses after logout never populate data", async () => { let resolve: ((v: ReturnType<typeof response>) => void) | undefined; h.invoke.mockImplementation(() => new Promise(r => { resolve = r; })); const hook = renderHook(({ account }) => useNextBooking(account, "", "", true), { initialProps: { account: "u1" as string | undefined } }); await flush(); hook.rerender({ account: undefined }); await act(async () => { resolve?.(response()); }); expect(hook.result.current.data).toBeNull(); hook.unmount(); });
  it("hung requests stop showing loading and retry later", async () => { h.invoke.mockImplementation(() => new Promise(() => {})); const hook = renderHook(() => useNextBooking("u1", "", "", true)); await flush(); await act(async () => { await vi.advanceTimersByTimeAsync(10000); }); expect(hook.result.current.loading).toBe(false); await act(async () => { await vi.advanceTimersByTimeAsync(15000); }); expect(h.invoke).toHaveBeenCalledTimes(2); hook.unmount(); });
});