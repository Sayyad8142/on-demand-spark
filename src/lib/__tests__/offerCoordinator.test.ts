import { describe, it, expect, vi, beforeEach } from "vitest";
const recovery = vi.hoisted(() => vi.fn());
const popup = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authoritativeOffer', () => ({ recoverOfferDeadline: recovery }));
vi.mock("@/integrations/supabase/client", () => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { status: "pending", worker_id: null } }) };
  return { supabase: { auth: { getUser: async () => ({ data: { user: null } }) }, from: () => q } };
});
vi.mock("@/lib/bookingAck", () => ({ rememberAckToken: vi.fn(), forgetAckToken: vi.fn() }));
vi.mock("@/lib/fcmAckTracker", () => ({ resolveFcmOffer: popup }));
vi.mock("@/lib/bookingAlertFallback", () => ({ clearBookingAlertFallback: vi.fn() }));
vi.mock("@/lib/scheduledBookingGuards", () => ({ canShowWorkerBookingOffer: () => true, isBeforeScheduledDispatchWindow: () => false, logScheduledOfferDecision: vi.fn() }));
import { processIncomingBooking, getCurrentAlert, dismissAlert, clearAlertState, onNewAlert, retireOfferGeneration } from "@/services/bookingAlertCoordinator";
const offer = (id: string, timeoutAt: string) => ({ bookingId: id, bookingRequestId: `r-${id}`, custName: "C", community: "x", serviceType: "maid", flatNo: "1", priceInr: 1, source: "fcm" as const, timeoutAt });
beforeEach(() => { clearAlertState(); localStorage.clear(); recovery.mockReset(); popup.mockClear(); vi.useRealTimers(); });
describe("coordinator generation dedupe", () => {
  it('undated realtime offer recovers exact server expiry without inventing a TTL', async () => {
    const deadline = new Date(Date.now() + 23_000).toISOString();
    recovery.mockResolvedValue(deadline);
    const incoming = { ...offer('recover', ''), timeoutAt: undefined };
    expect(await processIncomingBooking(incoming)).toBe(true);
    expect(recovery).toHaveBeenCalledWith('recover', 'r-recover');
    expect(getCurrentAlert()?.timeoutAt).toBe(deadline);
  });
  it('unavailable authoritative expiry cannot show an undated offer', async () => {
    recovery.mockResolvedValue(null);
    expect(await processIncomingBooking({ ...offer('no-expiry', ''), timeoutAt: undefined })).toBe(false);
    expect(getCurrentAlert()).toBeNull();
  });
  it.each(['rejected', 'cancelled', 'timed_out', 'expired'])('closed %s request never shows', async requestStatus => {
    expect(await processIncomingBooking({ ...offer(`closed-${requestStatus}`, new Date(Date.now() + 60_000).toISOString()), requestStatus })).toBe(false);
  });
  it('coordinator delivery is not visible-popup evidence', async () => {
    expect(await processIncomingBooking({ ...offer('not-rendered', new Date(Date.now() + 60_000).toISOString()), source: 'heartbeat' })).toBe(true);
    await Promise.resolve();
    expect(popup).not.toHaveBeenCalledWith('not-rendered', 'popup_shown');
  });
  it("closed request does not permanently suppress later same-row re-offer", async () => {
    const now = Date.now();
    const first = offer("closed-generation", new Date(now + 10000).toISOString());
    expect(await processIncomingBooking(first)).toBe(true);
    retireOfferGeneration(first.bookingId, first.timeoutAt);
    expect(await processIncomingBooking(offer(first.bookingId, new Date(now + 70000).toISOString()))).toBe(true);
  });
  it("delayed old closure cannot close newer generation", async () => {
    const now = Date.now();
    const latest = offer("delayed-close", new Date(now + 70000).toISOString());
    expect(await processIncomingBooking(latest)).toBe(true);
    retireOfferGeneration(latest.bookingId, new Date(now + 10000).toISOString());
    expect(getCurrentAlert()?.timeoutAt).toBe(latest.timeoutAt);
  });
  it("duplicate deliveries show once even when concurrent", async () => {
    const incoming = offer("duplicate", new Date(Date.now() + 60000).toISOString());
    const listener = vi.fn(); const off = onNewAlert(listener);
    expect((await Promise.all([processIncomingBooking(incoming), processIncomingBooking({ ...incoming })])).filter(Boolean)).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1); off();
  });
  it("same request re-offer is shown after previous deadline expires", async () => {
    const now = Date.now(); vi.useFakeTimers(); vi.setSystemTime(now);
    expect(await processIncomingBooking(offer("reoffer", new Date(now + 10000).toISOString()))).toBe(true);
    vi.setSystemTime(now + 11000);
    expect(await processIncomingBooking(offer("reoffer", new Date(now + 71000).toISOString()))).toBe(true);
    expect(getCurrentAlert()?.timeoutAt).toBe(new Date(now + 71000).toISOString()); vi.useRealTimers();
  });
  it("no second same-booking popup while the first remains live", async () => {
    const now = Date.now();
    expect(await processIncomingBooking(offer("live", new Date(now + 60000).toISOString()))).toBe(true);
    expect(await processIncomingBooking(offer("live", new Date(now + 120000).toISOString()))).toBe(false);
    dismissAlert("live");
  });
});