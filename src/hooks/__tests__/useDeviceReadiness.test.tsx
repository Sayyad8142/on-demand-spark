import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ snapshot: vi.fn(), repair: vi.fn(), resume: null as null | ((s: { isActive: boolean }) => void) }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: async (_: string, cb: typeof h.resume) => { h.resume = cb; return { remove: vi.fn() }; } } }));
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: { checkPermissions: async () => ({ receive: 'granted' }) } }));
vi.mock('@/lib/pushToken', () => ({ getPushHealthSnapshot: h.snapshot, performPushRepair: h.repair }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { fcm_token: 'old-server-token', fcm_token_status: 'active' } }) }) }) }),
  auth: { getSession: async () => ({ data: { session: { expires_at: Date.now() / 1000 + 600 } } }) },
} }));
import { useDeviceReadiness } from '../useDeviceReadiness';
beforeEach(() => { vi.clearAllMocks(); h.snapshot.mockResolvedValue({ tokenHealthy: false }); h.repair.mockResolvedValue({ success: false }); });
describe('Device Readiness', () => {
  it('granted permission and mismatched token remain separate results', async () => {
    const hook = renderHook(() => useDeviceReadiness('worker'));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.checks.find(c => c.label === 'Notification Permission')?.status).toBe('pass');
    expect(hook.result.current.checks.find(c => c.label === 'FCM Token')?.status).toBe('fail'); hook.unmount();
  });
  it('Retry performs registration before fresh readiness checks', async () => {
    const hook = renderHook(() => useDeviceReadiness('worker'));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    h.snapshot.mockResolvedValue({ tokenHealthy: true });
    await act(async () => { await hook.result.current.repair(); });
    expect(h.repair).toHaveBeenCalledWith('worker', 'device-readiness-retry', { requestPermission: true });
    expect(hook.result.current.checks.find(c => c.label === 'FCM Token')?.status).toBe('pass'); hook.unmount();
  });
  it('refreshes readiness on native Settings return', async () => {
    const hook = renderHook(() => useDeviceReadiness('worker'));
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    h.snapshot.mockResolvedValue({ tokenHealthy: true });
    act(() => h.resume?.({ isActive: true }));
    await waitFor(() => expect(hook.result.current.checks.find(c => c.label === 'FCM Token')?.status).toBe('pass')); hook.unmount();
  });
});