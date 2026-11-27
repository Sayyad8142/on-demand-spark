import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ read: vi.fn(), remove: vi.fn(), foreground: null as null | ((state: { isActive: boolean }) => void) }));
vi.mock("@/lib/bankSelfService", () => ({ readMyBankDetails: h.read }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/app", () => ({ App: { addListener: async (_: string, cb: typeof h.foreground) => { h.foreground = cb; return { remove: h.remove }; } } }));
import { useBankDetails } from "../useBankDetails";
const none = { status: "none", canEdit: true, failureReason: null, accountHolderName: null, accountNumberMasked: null, ifsc: null, bankName: null };
function setup(id: string | null = "worker-a") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(({ account }) => useBankDetails(account), { wrapper, initialProps: { account: id } }) };
}
beforeEach(() => { vi.clearAllMocks(); h.foreground = null; h.read.mockResolvedValue(none); });
afterEach(cleanup);
describe("shared own bank status", () => {
  it("publishes the server submission response to all observers for that worker", async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.bank?.status).toBe("none"));
    const pending = { ...none, status: "pending", accountNumberMasked: "XXXX9012" };
    act(() => hook.client.setQueryData(["my-bank-details", "worker-a"], pending));
    await waitFor(() => expect(hook.result.current.bank).toEqual(pending));
    expect(hook.client.getQueryData(["my-bank-details", "worker-b"])).toBeUndefined();
  });
  it("reads verification changes on Android foreground, but not background", async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.bank?.status).toBe("none"));
    h.read.mockResolvedValue({ ...none, status: "verified", canEdit: false });
    act(() => h.foreground?.({ isActive: false }));
    expect(h.read).toHaveBeenCalledOnce();
    act(() => h.foreground?.({ isActive: true }));
    await waitFor(() => expect(hook.result.current.bank?.status).toBe("verified"));
    hook.unmount(); expect(h.remove).toHaveBeenCalledOnce();
  });
  it("does not show one worker's bank details after account switching", async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.bank?.status).toBe("none"));
    h.read.mockReturnValue(new Promise(() => {}));
    hook.rerender({ account: "worker-b" });
    expect(hook.result.current.bank).toBeNull();
  });
  it("never requests bank details for a signed-out or guest account", () => {
    const hook = setup(null); expect(h.read).not.toHaveBeenCalled(); expect(hook.result.current.bank).toBeNull();
  });
});