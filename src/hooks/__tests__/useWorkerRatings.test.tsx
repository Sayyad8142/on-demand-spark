import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ summary: vi.fn(), reviews: vi.fn(), remove: vi.fn(), nativeRemove: vi.fn(), native: null as null | ((s: { isActive: boolean }) => void), update: null as null | (() => void) }));
vi.mock('@/lib/workerRatings', () => ({ fetchRatingSummary: h.summary, fetchCompletedReviews: h.reviews }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: async (_: string, cb: typeof h.native) => { h.native = cb; return { remove: h.nativeRemove }; } } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  channel: () => { const c = { on: (_: string, _filter: unknown, cb: () => void) => { h.update = cb; return c; }, subscribe: () => c }; return c; }, removeChannel: h.remove,
} }));
import { useWorkerRatings } from '../useWorkerRatings';
function setup(worker = 'w', reviews = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(({ id }) => useWorkerRatings(id, reviews), { wrapper, initialProps: { id: worker } });
}
beforeEach(() => {
  vi.clearAllMocks(); h.native = null; h.update = null;
  h.summary.mockResolvedValue({ average: 4, count: 10 }); h.reviews.mockResolvedValue([]);
});
describe('Rating refresh lifecycle', () => {
  it('reads summary and completed reviews on app screen open', async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.summary.data?.count).toBe(10));
    expect(h.summary).toHaveBeenCalledWith('w'); expect(h.reviews).toHaveBeenCalledWith('w'); hook.unmount();
  });
  it('refreshes on foreground', async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.summary.isSuccess).toBe(true));
    h.summary.mockResolvedValue({ average: 5, count: 11 });
    act(() => { h.native?.({ isActive: true }); });
    await waitFor(() => expect(hook.result.current.summary.data?.count).toBe(11)); hook.unmount();
  });
  it('refreshes after confirmed booking completion', async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.summary.isSuccess).toBe(true));
    h.summary.mockResolvedValue({ average: 3, count: 12 });
    act(() => window.dispatchEvent(new Event('bookingCompleted')));
    await waitFor(() => expect(hook.result.current.summary.data?.count).toBe(12)); hook.unmount();
  });
  it('refreshes when a customer update changes the server aggregate', async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.summary.isSuccess).toBe(true));
    h.summary.mockResolvedValue({ average: 2, count: 13 }); act(() => h.update?.());
    await waitFor(() => expect(hook.result.current.summary.data?.average).toBe(2)); hook.unmount();
  });
  it('does not carry previous worker values into a switched account', async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.summary.isSuccess).toBe(true));
    h.summary.mockImplementation(() => new Promise(() => {})); hook.rerender({ id: 'other' });
    expect(hook.result.current.summary.data).toBeUndefined(); hook.unmount();
  });
  it('does not retrieve individual ratings on Home or Profile', async () => {
    const hook = setup('w', false); await waitFor(() => expect(hook.result.current.summary.isSuccess).toBe(true));
    expect(h.reviews).not.toHaveBeenCalled(); hook.unmount();
  });
  it('cleans native, realtime and completion listeners on leaving', async () => {
    const hook = setup(); await waitFor(() => expect(hook.result.current.summary.isSuccess).toBe(true)); hook.unmount();
    const calls = h.summary.mock.calls.length; act(() => window.dispatchEvent(new Event('bookingCompleted')));
    expect(h.summary).toHaveBeenCalledTimes(calls); expect(h.remove).toHaveBeenCalled(); expect(h.nativeRemove).toHaveBeenCalled();
  });
});