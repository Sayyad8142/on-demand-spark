import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  permission: vi.fn(), register: vi.fn(), listeners: new Map<string, (v: unknown) => void>(),
  remove: vi.fn(), user: vi.fn(), from: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: {
  checkPermissions: h.permission, requestPermissions: h.permission, register: h.register,
  addListener: async (name: string, cb: (v: unknown) => void) => { h.listeners.set(name, cb); return { remove: h.remove }; },
} }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: h.user }, from: h.from } }));
vi.mock('@/lib/installedVersion', () => ({ getInstalledVersionSync: () => ({ version: 'test' }) }));
import { ensurePushPermission, syncTokenToBackend, waitForNativeFcmToken } from '../pushToken';
beforeEach(() => { vi.clearAllMocks(); h.listeners.clear(); h.permission.mockResolvedValue({ receive: 'granted' }); });
describe('Android push registration', () => {
  it('permission-check errors are not reported as denied permission', async () => {
    h.permission.mockRejectedValue(new Error('bridge unavailable'));
    await expect(ensurePushPermission('test')).rejects.toThrow('Notification permission could not be checked');
  });
  it('reads native permission rather than browser permission', async () => {
    expect(await ensurePushPermission('test')).toBe(true); expect(h.permission).toHaveBeenCalledOnce();
  });
  it('captures immediate registration events with listeners installed first', async () => {
    h.register.mockImplementation(async () => h.listeners.get('registration')?.({ value: 'fresh-device-token' }));
    expect(await waitForNativeFcmToken({ reason: 'retry', timeoutMs: 50 })).toBe('fresh-device-token');
    expect(h.remove).toHaveBeenCalledTimes(2);
  });
  it('registration failure returns no token and cleans both listeners', async () => {
    h.register.mockImplementation(async () => h.listeners.get('registrationError')?.({ error: 'firebase_unavailable' }));
    expect(await waitForNativeFcmToken({ reason: 'retry', timeoutMs: 50 })).toBeNull();
    expect(h.remove).toHaveBeenCalledTimes(2);
  });
  it('refuses to synchronize against an account different from the verified session', async () => {
    h.user.mockResolvedValue({ data: { user: { id: 'current' } }, error: null });
    expect(await syncTokenToBackend('device-token', 'old-account', 'test')).toBe(false);
    expect(h.from).not.toHaveBeenCalled();
  });
  it('saves the token only against the logged-in worker and marks it active', async () => {
    h.user.mockResolvedValue({ data: { user: { id: 'current' } }, error: null });
    const select = vi.fn().mockResolvedValue({ data: [{ id: 'own-worker' }], error: null });
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    h.from.mockImplementation((table) => table === 'workers' ? { update } : { upsert: vi.fn().mockResolvedValue({ error: null }) });
    expect(await syncTokenToBackend('device-token', 'current', 'test')).toBe(true);
    expect(eq).toHaveBeenCalledWith('user_id', 'current');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ fcm_token: 'device-token', fcm_token_status: 'active', fcm_token_platform: 'android' }));
  });
});