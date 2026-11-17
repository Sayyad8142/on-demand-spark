import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  snapshot: vi.fn(), manual: vi.fn(), automatic: vi.fn(), remove: vi.fn(),
  resume: null as null | ((s: { isActive: boolean }) => void),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: async (_: string, cb: typeof h.resume) => { h.resume = cb; return { remove: h.remove }; } } }));
vi.mock('@/lib/pushToken', () => ({ getPushHealthSnapshot: h.snapshot }));
vi.mock('@/services/pushRepairCoordinator', () => ({
  getPushRepairStatus: () => ({ phase: 'idle', maxAttempts: 4 }),
  subscribePushRepairStatus: () => () => {},
  triggerManualPushRepair: h.manual, triggerAutomaticPushRepair: h.automatic,
}));
import { usePushHealthGuard } from '../usePushHealthGuard';
const healthy = { permissionGranted: true, tokenExists: true, tokenSyncedToBackend: true, tokenHealthy: true, isHealthy: true };
beforeEach(() => {
  vi.clearAllMocks(); h.resume = null;
  h.snapshot.mockImplementation(async (_id, permission) => { permission?.(true); return healthy; });
});
describe('native notification readiness', () => {
  it('checks already-granted permission on opening', async () => {
    const hook = renderHook(() => usePushHealthGuard('worker'));
    await waitFor(() => expect(hook.result.current.isHealthy).toBe(true));
    expect(hook.result.current.permissionGranted).toBe(true); hook.unmount();
  });
  it('updates granted permission before a slow FCM/backend check completes', async () => {
    h.snapshot.mockImplementation((_id, permission) => { permission?.(true); return new Promise(() => {}); });
    const hook = renderHook(() => usePushHealthGuard('worker'));
    await waitFor(() => expect(hook.result.current.permissionGranted).toBe(true));
    expect(hook.result.current.isHealthy).toBe(false); hook.unmount();
  });
  it('rechecks the OS after returning from Settings through native resume', async () => {
    h.snapshot.mockResolvedValueOnce({ ...healthy, permissionGranted: false, isHealthy: false });
    const hook = renderHook(() => usePushHealthGuard('worker'));
    await waitFor(() => expect(hook.result.current.isChecking).toBe(false));
    act(() => h.resume?.({ isActive: true }));
    await waitFor(() => expect(hook.result.current.isHealthy).toBe(true)); hook.unmount();
  });
  it('Retry reads permission back even when registration fails', async () => {
    const hook = renderHook(() => usePushHealthGuard('worker'));
    await waitFor(() => expect(hook.result.current.isHealthy).toBe(true));
    h.manual.mockResolvedValue(false);
    h.snapshot.mockImplementation(async (_id, permission) => { permission?.(true); return { ...healthy, tokenSyncedToBackend: false, isHealthy: false }; });
    await act(async () => { expect(await hook.result.current.repair()).toBe(false); });
    expect(hook.result.current.permissionGranted).toBe(true);
    expect(hook.result.current.isHealthy).toBe(false); hook.unmount();
  });
  it('does not apply an old account check after account change', async () => {
    let finish: ((v: typeof healthy) => void) | undefined;
    h.snapshot.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const hook = renderHook(({ id }) => usePushHealthGuard(id), { initialProps: { id: 'first' } });
    h.snapshot.mockResolvedValue({ ...healthy, permissionGranted: false, isHealthy: false });
    hook.rerender({ id: 'second' });
    await waitFor(() => expect(hook.result.current.isChecking).toBe(false));
    await act(async () => { finish?.(healthy); });
    expect(hook.result.current.permissionGranted).toBe(false); hook.unmount();
  });
  it('removes native resume checks on leaving', async () => {
    const hook = renderHook(() => usePushHealthGuard('worker'));
    await waitFor(() => expect(hook.result.current.isHealthy).toBe(true));
    hook.unmount(); await waitFor(() => expect(h.remove).toHaveBeenCalled());
  });
});