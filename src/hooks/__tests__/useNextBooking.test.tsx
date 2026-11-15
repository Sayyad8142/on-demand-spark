import { act, renderHook } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ invoke: vi.fn(), session: vi.fn(), refresh: vi.fn(), native: null as null | ((s: { isActive: boolean }) => void) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: h.session, refreshSession: h.refresh }, functions: { invoke: h.invoke }, from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }; return q; } } }));
vi.mock("@capacitor/app", () => ({ App: { addListener: async (_: string, cb: typeof h.native) => { h.native = cb; return { remove: vi.fn() }; } } }));
import { useNextBooking } from "../useNextBooking";
const now = Date.parse("2026-11-12T08:40:00Z");
const response = () => ({ data: { version: 1, updatedAt: new Date(Date.now()).toISOString(), slotStart: new Date(Math.floor(Date.now() / 1800000) * 1800000).toISOString(), slotEnd: new Date(Math.floor(Date.now() / 1800000) * 1800000 + 1800000).toISOString(), community: "c", service: "maid", communities: ["c"], services: ["maid"], reason: "available", rows: [{ rank: 1, name: "Test", priority: 80, rating: 4.5, isMe: true }] }, error: null });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); h.invoke.mockReset(); h.session.mockReset(); h.refresh.mockReset(); h.native = null;
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  h.session.mockResolvedValue({ data: { session: { user: { id: "u1" }, access_token: "test-only" } } });
  h.invoke.mockImplementation(async () => response());
});
afterEach(() => { vi.useRealTimers(); });
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
describe("Next Booking refresh safety", () => {
  it("reports disabled without allowing Retry to activate integration", async () => {
    const hook = renderHook(() => useNextBooking("u1", "", "")); await flush();
    expect(hook.result.current.error).toBe("disabled"); act(() => hook.result.current.retry()); await flush();
    expect(h.invoke).not.toHaveBeenCalled(); hook.unmount();
  });
  it("reports a missing endpoint instead of worker ineligibility", async () => {
    h.invoke.mockResolvedValue({ data: null, error: { context: { status: 404 } } });
    const hook = renderHook(() => useNextBooking("u1", "", "", true)); await flush();
    expect(hook.result.current.error).toBe("unavailable"); expect(hook.result.current.data).toBeNull(); hook.unmount();
  });
  it("manual Retry reads a fresh verified snapshot after connection failure", async () => {
    h.invoke.mockResolvedValueOnce({ data: null, error: Error("offline") });
    const hook = renderHook(() => useNextBooking("u1", "", "", true)); await flush();
    expect(hook.result.current.error).toBe("connection"); act(() => hook.result.current.retry()); await flush();
    expect(h.invoke).toHaveBeenCalledTimes(2); expect(hook.result.current.data?.rows[0].rank).toBe(1);
    expect(hook.result.current.error).toBeNull(); hook.unmount();
  });
  it("refreshes an expired session and sends only the refreshed JWT", async () => {
    h.session.mockResolvedValue({ data: { session: { user: { id: "u1" }, access_token: "expired-test", expires_at: now / 1000 - 1 } } });
    h.refresh.mockResolvedValue({ data: { session: { user: { id: "u1" }, access_token: "fresh-test" } }, error: null });
    const hook = renderHook(() => useNextBooking("u1", "", "", true)); await flush();
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith("worker-availability-ranking", { body: { community: undefined, service: undefined }, headers: { Authorization: "Bearer fresh-test" } }); hook.unmount();
  });
  it("retries a 401 only once before reporting an expired login", async () => {
    h.invoke.mockResolvedValue({ data: null, error: { context: { status: 401 } } });
    h.refresh.mockResolvedValue({ data: { session: { user: { id: "u1" }, access_token: "fresh-test" } }, error: null });
    const hook = renderHook(() => useNextBooking("u1", "", "", true)); await flush();
    expect(h.invoke).toHaveBeenCalledTimes(2); expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(hook.result.current.error).toBe("auth"); hook.unmount();
  });
  it("refuses another account returned by session refresh", async () => {
    h.invoke.mockResolvedValue({ data: null, error: { context: { status: 401 } } });
    h.refresh.mockResolvedValue({ data: { session: { user: { id: "u2" }, access_token: "other-test" } }, error: null });
    const hook = renderHook(() => useNextBooking("u1", "", "", true)); await flush();
    expect(h.invoke).toHaveBeenCalledTimes(1); expect(hook.result.current.error).toBe("auth"); hook.unmount();
  });
  it.each(["off", "no_slot", "busy", "inactive"])("preserves the backend eligibility reason %s", async reason => {
    h.invoke.mockImplementation(async () => ({ data: { ...response().data, reason, rows: [] }, error: null }));
    const hook = renderHook(() => useNextBooking("u1", "", "", true)); await flush();
    expect(hook.result.current.data?.reason).toBe(reason); expect(hook.result.current.error).toBeNull(); hook.unmount();
  });
  it("rejects invalid data without inventing a ranking", async () => {
    h.invoke.mockResolvedValue({ data: { reason: "available", rank: 1 }, error: null });
    const hook = renderHook(() => useNextBooking("u1", "", "", true)); await flush();
    expect(hook.result.current.error).toBe("invalid"); expect(hook.result.current.data).toBeNull(); hook.unmount();
  });
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