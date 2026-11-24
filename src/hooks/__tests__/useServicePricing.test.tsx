import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pricingFixture } from '@/lib/__tests__/servicePricingFixture';
const h = vi.hoisted(() => ({ enabled: true, invoke: vi.fn(), getUser: vi.fn(), renew: vi.fn() }));
vi.mock('@/lib/servicePricing', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/servicePricing')>(), get SERVICE_PRICING_ENABLED() { return h.enabled; } }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: h.getUser, refreshSession: h.renew }, functions: { invoke: h.invoke } } }));
import { useServicePricing } from '../useServicePricing';
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  vi.clearAllMocks(); h.enabled = true;
  h.getUser.mockResolvedValue({ data: { user: { id: 'own' } }, error: null });
  h.invoke.mockResolvedValue({ data: pricingFixture(), error: null });
  h.renew.mockResolvedValue({ data: { session: { user: { id: 'own' } } }, error: null });
});
describe('Read-only pricing session boundaries', () => {
  it('does not request prices while disabled', () => {
    h.enabled = false; const hook = renderHook(() => useServicePricing('own', ''));
    expect(h.invoke).not.toHaveBeenCalled(); expect(hook.result.current.data).toBeNull(); hook.unmount();
  });
  it('does not request prices without a session', () => {
    const hook = renderHook(() => useServicePricing(undefined, ''));
    expect(h.getUser).not.toHaveBeenCalled(); expect(h.invoke).not.toHaveBeenCalled(); hook.unmount();
  });
  it('sends only community selection and never a worker id', async () => {
    const hook = renderHook(() => useServicePricing('own', id));
    await waitFor(() => expect(hook.result.current.data).not.toBeNull());
    expect(h.invoke).toHaveBeenCalledWith('worker-service-pricing', { body: { community_id: id } }); hook.unmount();
  });
  it('clears old-account and old-community prices immediately', async () => {
    const hook = renderHook(({ owner, selected }) => useServicePricing(owner, selected), { initialProps: { owner: 'own', selected: id } });
    await waitFor(() => expect(hook.result.current.data).not.toBeNull());
    h.invoke.mockImplementation(() => new Promise(() => {}));
    hook.rerender({ owner: 'own', selected: 'other' }); expect(hook.result.current.data).toBeNull();
    hook.rerender({ owner: 'other-account', selected: id }); expect(hook.result.current.data).toBeNull(); hook.unmount();
  });
  it('rejects a response for a different selected community', async () => {
    const hook = renderHook(() => useServicePricing('own', 'other'));
    await waitFor(() => expect(hook.result.current.error).toBe(true)); expect(hook.result.current.data).toBeNull(); hook.unmount();
  });
  it('rejects current-row association without Admin provenance', async () => {
    const fixture = pricingFixture(); const community = fixture.communities[0]; if (community) community.association_verification = 'current_worker_row';
    h.invoke.mockResolvedValue({ data: fixture, error: null });
    const hook = renderHook(() => useServicePricing('own', ''));
    await waitFor(() => expect(hook.result.current.error).toBe(true)); expect(hook.result.current.data).toBeNull(); hook.unmount();
  });
  it('retries authentication once and no more', async () => {
    h.invoke.mockResolvedValue({ data: null, error: { context: new Response(null, { status: 401 }) } });
    const hook = renderHook(() => useServicePricing('own', ''));
    await waitFor(() => expect(hook.result.current.error).toBe(true));
    expect(h.invoke).toHaveBeenCalledTimes(2); expect(h.renew).toHaveBeenCalledTimes(1); hook.unmount();
  });
  it('refuses a changed login before the request', async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: 'different' } }, error: null });
    const hook = renderHook(() => useServicePricing('own', ''));
    await waitFor(() => expect(hook.result.current.error).toBe(true)); expect(h.invoke).not.toHaveBeenCalled(); hook.unmount();
  });
  it('keeps same-community memory on failure with an explicit error', async () => {
    const hook = renderHook(() => useServicePricing('own', id));
    await waitFor(() => expect(hook.result.current.data).not.toBeNull());
    h.invoke.mockResolvedValue({ data: null, error: new Error('offline') });
    await act(async () => { await hook.result.current.refresh(); });
    expect(hook.result.current.data?.communities[0]?.id).toBe(id); expect(hook.result.current.error).toBe(true); hook.unmount();
  });
  it('reads a new server revision on reconnect', async () => {
    const hook = renderHook(() => useServicePricing('own', id));
    await waitFor(() => expect(hook.result.current.data).not.toBeNull());
    h.invoke.mockResolvedValue({ data: { ...pricingFixture(), config_revision: 'changed-by-admin' }, error: null });
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(hook.result.current.data?.config_revision).toBe('changed-by-admin')); hook.unmount();
  });
  it('clears cached rates after assignment permission is refused', async () => {
    const hook = renderHook(() => useServicePricing('own', id));
    await waitFor(() => expect(hook.result.current.data).not.toBeNull());
    h.invoke.mockResolvedValue({ data: null, error: { context: new Response(null, { status: 403 }) } });
    await act(async () => { await hook.result.current.refresh(); });
    expect(hook.result.current.data).toBeNull(); expect(hook.result.current.error).toBe(true); hook.unmount();
  });
  it('clears cached rates when the verified login changes', async () => {
    const hook = renderHook(() => useServicePricing('own', id));
    await waitFor(() => expect(hook.result.current.data).not.toBeNull());
    h.getUser.mockResolvedValue({ data: { user: { id: 'different' } }, error: null });
    await act(async () => { await hook.result.current.refresh(); });
    expect(hook.result.current.data).toBeNull(); hook.unmount();
  });
});