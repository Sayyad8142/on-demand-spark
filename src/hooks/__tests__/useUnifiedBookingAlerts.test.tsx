import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  listener: null as null | ((a: Record<string, unknown>) => void),
  accepting: new Set<string>(),
  tryAccept: vi.fn(),
  invalidateOffer: vi.fn(),
  dismissAlert: vi.fn(),
  markAlertRendered: vi.fn(),
  postFallback: vi.fn(async () => true),
  native: { isNative: false, platform: "web" },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => h.native.isNative, getPlatform: () => h.native.platform },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => {
  const ch = { on: () => ch, subscribe: () => ch };
  return { supabase: { channel: () => ch, removeChannel: vi.fn() } };
});
vi.mock("@/lib/bookingActions", () => ({ tryAccept: h.tryAccept, rejectBooking: vi.fn() }));
vi.mock("@/lib/bookingAlertFallback", () => ({ postBookingAlertFallback: h.postFallback }));
vi.mock("@/services/bookingAlertCoordinator", () => ({
  onNewAlert: (fn: (a: Record<string, unknown>) => void) => { h.listener = fn; return () => { h.listener = null; }; },
  dismissAlert: h.dismissAlert,
  invalidateOffer: h.invalidateOffer,
  markAlertOpened: vi.fn(),
  markAlertRendered: h.markAlertRendered,
  markAcceptedByMe: vi.fn((id: string) => h.accepting.delete(id)),
  isOwnAcceptance: () => false,
  pruneShownBookings: vi.fn(),
  beginAcceptance: (id: string) => { if (h.accepting.has(id)) return false; h.accepting.add(id); return true; },
  endAcceptance: (id: string) => { h.accepting.delete(id); },
}));

import { useUnifiedBookingAlerts } from "@/hooks/useUnifiedBookingAlerts";

const future = () => new Date(Date.now() + 60_000).toISOString();

function offer(id: string, timeoutAt = future()) {
  act(() => {
    h.listener?.({ bookingId: id, bookingRequestId: `r-${id}`, custName: "C", community: "x", serviceType: "maid", flatNo: "101", priceInr: 300, timeoutAt });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.accepting.clear();
  h.native.isNative = false;
  h.native.platform = "web";
  (window as unknown as { Capacitor?: unknown }).Capacitor = undefined;
});

describe("useUnifiedBookingAlerts — Accept", () => {
  it("temporary network failure keeps the still-valid offer open and allows retry", async () => {
    const { result } = renderHook(() => useUnifiedBookingAlerts("u1", true, () => true, "w1"));
    offer("b1");
    h.tryAccept.mockResolvedValueOnce({ success: false, error: "TypeError: Failed to fetch" });
    await act(async () => { await result.current.accept(); });
    expect(result.current.pending?.id).toBe("b1");
    expect(h.invalidateOffer).not.toHaveBeenCalled();

    h.tryAccept.mockResolvedValueOnce({ success: true });
    await act(async () => { await result.current.accept(); });
    expect(h.tryAccept).toHaveBeenCalledTimes(2);
    expect(result.current.pending).toBeNull();
  });

  it("already taken by someone else → offer closes everywhere", async () => {
    const { result } = renderHook(() => useUnifiedBookingAlerts("u1", true, () => true, "w1"));
    offer("b2");
    h.tryAccept.mockResolvedValueOnce({ success: false, error: "Booking already accepted" });
    await act(async () => { await result.current.accept(); });
    expect(h.invalidateOffer).toHaveBeenCalledWith("b2", "r-b2");
    expect(result.current.pending).toBeNull();
  });

  it("expired offer is closed without sending an Accept", async () => {
    const { result } = renderHook(() => useUnifiedBookingAlerts("u1", true, () => true, "w1"));
    offer("b3", new Date(Date.now() - 1000).toISOString());
    await act(async () => { await result.current.accept(); });
    expect(h.tryAccept).not.toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
  });

  it("double tap sends only ONE Accept request", async () => {
    const { result } = renderHook(() => useUnifiedBookingAlerts("u1", true, () => true, "w1"));
    offer("b4");
    let resolve!: (v: unknown) => void;
    h.tryAccept.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    await act(async () => {
      const first = result.current.accept();
      const second = result.current.accept();
      await second;
      resolve({ success: true });
      await first;
    });
    expect(h.tryAccept).toHaveBeenCalledTimes(1);
  });
});

describe("useUnifiedBookingAlerts — pop-up fallback", () => {
  it("when the Android pop-up fails to open, the in-app alert and backup notification are shown", async () => {
    h.native.isNative = true;
    h.native.platform = "android";
    const showBookingOverlay = vi.fn(async () => { throw new Error("startForegroundService not allowed"); });
    (window as unknown as { Capacitor: unknown }).Capacitor = { Plugins: { OverlayPlugin: { showBookingOverlay } } };
    renderHook(() => useUnifiedBookingAlerts("u1", true, () => true, "w1"));
    offer("b5");
    await waitFor(() => expect(h.postFallback).toHaveBeenCalledTimes(1));
    expect(h.markAlertRendered).toHaveBeenCalledWith("b5", "r-b5");
  });

  it("when the pop-up opens normally, no backup notification is posted", async () => {
    h.native.isNative = true;
    h.native.platform = "android";
    const showBookingOverlay = vi.fn(async () => {});
    (window as unknown as { Capacitor: unknown }).Capacitor = { Plugins: { OverlayPlugin: { showBookingOverlay } } };
    renderHook(() => useUnifiedBookingAlerts("u1", true, () => true, "w1"));
    offer("b6");
    await waitFor(() => expect(showBookingOverlay).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(h.postFallback).not.toHaveBeenCalled();
  });
});
