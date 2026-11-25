import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ enabled: true, getUser: vi.fn(), summary: vi.fn(), earnings: vi.fn() }));
vi.mock('@/lib/servicePricing', () => ({ get SERVICE_PRICING_ENABLED() { return h.enabled; } }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: h.getUser } } }));
vi.mock('@/lib/hybridPayoutApi', () => ({ createHybridPayoutClient: () => ({ getSummary: h.summary, getEarnings: h.earnings }) }));
import { usePricingEarnings } from '../usePricingEarnings';
beforeEach(() => {
  vi.clearAllMocks(); h.enabled = true;
  h.getUser.mockResolvedValue({ data: { user: { id: 'own' } }, error: null });
  h.summary.mockResolvedValue({ today: { earnedInr: 187 }, totalsInr: { paid: 999 } });
  h.earnings.mockResolvedValue({ items: [{ earningId: 'e1', earningInr: 187 }], nextCursor: null });
});
describe('Actual earnings on the disabled pricing screen', () => {
  it('makes no reads when pricing is disabled', () => {
    h.enabled = false; const hook = renderHook(() => usePricingEarnings('own'));
    expect(h.summary).not.toHaveBeenCalled(); expect(h.earnings).not.toHaveBeenCalled(); hook.unmount();
  });
  it('displays only server earnings and summary without calculating actual money', async () => {
    const hook = renderHook(() => usePricingEarnings('own'));
    await waitFor(() => expect(hook.result.current.summary?.totalsInr.paid).toBe(999));
    expect(hook.result.current.items[0]?.earningInr).toBe(187); expect(h.earnings).toHaveBeenCalledWith(null, null); hook.unmount();
  });
  it('refuses a mismatched authenticated account', async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: 'different' } }, error: null });
    const hook = renderHook(() => usePricingEarnings('own'));
    await waitFor(() => expect(hook.result.current.error).toBe(true)); expect(h.earnings).not.toHaveBeenCalled(); hook.unmount();
  });
  it('immediately removes previous-account amounts', async () => {
    const hook = renderHook(({ owner }) => usePricingEarnings(owner), { initialProps: { owner: 'own' } });
    await waitFor(() => expect(hook.result.current.summary).not.toBeNull());
    hook.rerender({ owner: 'another' }); expect(hook.result.current.summary).toBeNull(); expect(hook.result.current.items).toEqual([]); hook.unmount();
  });
  it('clears failed actual earnings instead of replacing them with estimates', async () => {
    const hook = renderHook(() => usePricingEarnings('own'));
    await waitFor(() => expect(hook.result.current.summary).not.toBeNull()); h.summary.mockRejectedValue(new Error('unavailable'));
    await act(async () => { await hook.result.current.refresh(); });
    expect(hook.result.current.summary).toBeNull(); expect(hook.result.current.items).toEqual([]); hook.unmount();
  });
  it('reads subsequent pages without duplicates or an endless repeated cursor', async () => {
    h.earnings.mockResolvedValueOnce({ items: [{ earningId: 'e1', earningInr: 187 }], nextCursor: 'next' })
      .mockResolvedValueOnce({ items: [{ earningId: 'e1', earningInr: 187 }, { earningId: 'e2', earningInr: 50 }], nextCursor: 'next' });
    const hook = renderHook(() => usePricingEarnings('own'));
    await waitFor(() => expect(hook.result.current.cursor).toBe('next'));
    await act(async () => { await hook.result.current.loadMore(); });
    expect(h.earnings).toHaveBeenLastCalledWith(null, 'next'); expect(hook.result.current.items.map(i => i.earningId)).toEqual(['e1', 'e2']); expect(hook.result.current.cursor).toBeNull(); hook.unmount();
  });
});