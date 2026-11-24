import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ read: vi.fn(), remove: vi.fn(), nativeRemove: vi.fn(), native: null as null | ((s: { isActive: boolean }) => void), update: null as null | (() => void) }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/app", () => ({ App: { addListener: async (_: string, cb: typeof h.native) => { h.native = cb; return { remove: h.nativeRemove }; } } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: (_: string, id: string) => ({ maybeSingle: () => h.read(id) }) }) }),
  channel: () => { const c = { on: (_: string, _filter: unknown, cb: () => void) => { h.update = cb; return c; }, subscribe: () => c }; return c; }, removeChannel: h.remove,
} }));
import { useWorkerPriority } from "../useWorkerPriority";
function setup(worker: string | null = "worker") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(({ id }) => useWorkerPriority(id), { wrapper, initialProps: { id: worker } });
}
beforeEach(() => { vi.clearAllMocks(); h.native = null; h.update = null; h.read.mockResolvedValue({ data: { priority_score: 68, score_reason: "server reason" }, error: null }); });
describe("Shared server priority refresh", () => {
  it("keeps exact score and reason paired, including zero", async () => {
    h.read.mockResolvedValue({ data: { priority_score: 0, score_reason: "final=0" }, error: null });
    const hook = setup(); await waitFor(() => expect(hook.result.current.data).toEqual({ score: 0, reason: "final=0" })); hook.unmount();
  });
  it("re-reads server-confirmed minus 5 once; repeated events never deduct again", async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.data?.score).toBe(68));
    h.read.mockResolvedValue({ data: { priority_score: 63, score_reason: "final=63" }, error: null });
    act(() => h.update?.()); await waitFor(() => expect(hook.result.current.data?.score).toBe(63));
    act(() => h.update?.()); await waitFor(() => expect(h.read).toHaveBeenCalledTimes(3));
    expect(hook.result.current.data?.score).toBe(63); hook.unmount();
  });
  it("refreshes on native foreground", async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.data?.score).toBe(68));
    h.read.mockResolvedValue({ data: { priority_score: 63, score_reason: "final=63" }, error: null });
    act(() => h.native?.({ isActive: true })); await waitFor(() => expect(hook.result.current.data?.score).toBe(63)); hook.unmount();
  });
  it("does not carry values into another worker", async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.data?.score).toBe(68));
    h.read.mockImplementation(() => new Promise(() => {})); hook.rerender({ id: "other" });
    expect(hook.result.current.data).toBeUndefined(); hook.unmount();
  });
  it("does not read for a guest or absent worker", () => { const hook = setup(null); expect(h.read).not.toHaveBeenCalled(); hook.unmount(); });
  it("cleans up native and server listeners", async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.isSuccess).toBe(true)); hook.unmount();
    expect(h.remove).toHaveBeenCalledTimes(1); expect(h.nativeRemove).toHaveBeenCalledTimes(1);
  });
});