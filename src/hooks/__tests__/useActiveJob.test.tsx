import { beforeEach, describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({ read: vi.fn(), update: vi.fn(), listener: null as null | ((payload: Record<string, unknown>) => void) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, abortSignal: () => q,
      maybeSingle: () => table === "workers" ? Promise.resolve({ data: { id: "w1" }, error: null }) : h.read(),
    }; return q;
  },
  rpc: (...args: unknown[]) => h.update(...args),
  channel: () => { const c = { on: (_event: string, _filter: unknown, cb: typeof h.listener) => { h.listener = cb; return c; }, subscribe: () => c }; return c; },
  removeChannel: vi.fn(),
} }));
vi.mock("@/lib/bookingEndRelease", () => ({ endedBookingIdFromRefetch: () => null, endedBookingIdFromUpdate: () => null, releaseNativeBookingLock: vi.fn() }));
import { useActiveJob } from "../useActiveJob";
const booking = { id: "b1", worker_id: "w1", status: "accepted", updated_at: "2026-11-12T08:00:00Z" };
beforeEach(() => { h.read.mockReset(); h.update.mockReset(); h.listener = null; });
const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
};
describe("shared Home booking cache", () => {
  it("returning Home instantly renders cached booking while a refresh is pending", async () => {
    h.read.mockResolvedValueOnce({ data: booking, error: null });
    const { client, wrapper } = setup();
    const first = renderHook(() => useActiveJob("u1"), { wrapper });
    await waitFor(() => expect(first.result.current.activeJob?.id).toBe("b1"));
    first.unmount();
    h.read.mockReturnValue(new Promise(() => {}));
    const second = renderHook(() => useActiveJob("u1"), { wrapper });
    expect(second.result.current.activeJob?.id).toBe("b1");
    expect(second.result.current.loading).toBe(false);
    second.unmount(); client.clear();
  });
  it("accept, start and complete server events update the rendered card immediately", async () => {
    h.read.mockResolvedValue({ data: null, error: null });
    const { client, wrapper } = setup();
    const hook = renderHook(() => useActiveJob("u1"), { wrapper });
    await waitFor(() => expect(hook.result.current.checked).toBe(true));
    await act(async () => { h.listener?.({ eventType: "UPDATE", new: { ...booking, completion_otp: "secret" } }); });
    await waitFor(() => expect(hook.result.current.activeJob?.status).toBe("accepted"));
    expect(hook.result.current.activeJob).not.toHaveProperty("completion_otp");
    await act(async () => { h.listener?.({ eventType: "UPDATE", new: { ...booking, status: "started" } }); });
    await waitFor(() => expect(hook.result.current.activeJob?.status).toBe("started"));
    await act(async () => { window.dispatchEvent(new CustomEvent("bookingCompleted", { detail: { bookingId: "b1" } })); });
    await waitFor(() => expect(hook.result.current.activeJob).toBeNull());
    hook.unmount(); client.clear();
  });
  it("an account switch never exposes another account's cached card", async () => {
    h.read.mockResolvedValue({ data: booking, error: null });
    const { client, wrapper } = setup();
    const hook = renderHook(({ uid }) => useActiveJob(uid), { wrapper, initialProps: { uid: "u1" } });
    await waitFor(() => expect(hook.result.current.activeJob?.id).toBe("b1"));
    h.read.mockReturnValue(new Promise(() => {}));
    hook.rerender({ uid: "u2" });
    expect(hook.result.current.activeJob).toBeNull();
    hook.unmount(); client.clear();
  });
});