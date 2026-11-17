import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ listeners: new Map<string, (v: any) => void>(), register: vi.fn(), sync: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: {
  checkPermissions: async () => ({ receive: 'granted' }),
  addListener: async (name: string, cb: (v: any) => void) => { h.listeners.set(name, cb); return { remove: vi.fn() }; },
  register: h.register,
} }));
vi.mock('@/lib/pushToken', () => ({ syncTokenToBackend: h.sync }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); h.listeners.clear(); h.sync.mockResolvedValue(true); });
describe('native registration lifecycle', () => {
  it('handles an immediate registration token for the current account', async () => {
    h.register.mockImplementation(async () => h.listeners.get('registration')?.({ value: 'same-device-token' }));
    const { initNativePush } = await import('../push');
    await initNativePush('first');
    expect(h.sync).toHaveBeenCalledWith('same-device-token', 'first', 'native-registration-event');
    await initNativePush('second');
    expect(h.sync).toHaveBeenCalledWith('same-device-token', 'second', 'native-registration-event');
  });
  it('syncs a rotated token received after initialization', async () => {
    h.register.mockResolvedValue(undefined);
    const { initNativePush } = await import('../push');
    await initNativePush('current');
    await h.listeners.get('registration')?.({ value: 'rotated-device-token' });
    expect(h.sync).toHaveBeenCalledWith('rotated-device-token', 'current', 'native-registration-event');
  });
});