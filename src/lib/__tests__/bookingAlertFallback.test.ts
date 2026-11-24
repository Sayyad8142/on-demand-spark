import { beforeEach, expect, it, vi } from 'vitest';
const schedule = vi.hoisted(() => vi.fn());
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: { schedule } }));
import { postBookingAlertFallback } from '../bookingAlertFallback';
beforeEach(() => schedule.mockClear());
it('backup notification carries original server expiry, never a fresh local window', async () => {
  const timeoutAt = new Date(Date.now() + 19_000).toISOString();
  expect(await postBookingAlertFallback({ bookingId: 'b', bookingRequestId: 'r', timeoutAt })).toBe(true);
  expect(schedule).toHaveBeenCalledWith(expect.objectContaining({ notifications: [expect.objectContaining({ extra: expect.objectContaining({ bookingRequestId: 'r', expires_at: Math.floor(Date.parse(timeoutAt) / 1000) }) })] }));
});
it('expired or undated backup cannot open an actionable notification', async () => {
  expect(await postBookingAlertFallback({ bookingId: 'b' })).toBe(false);
  expect(await postBookingAlertFallback({ bookingId: 'b', timeoutAt: new Date(Date.now() - 1).toISOString() })).toBe(false);
  expect(schedule).not.toHaveBeenCalled();
});