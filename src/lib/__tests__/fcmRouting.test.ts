import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  listeners: new Map<string, (value: any) => Promise<void>>(),
  process: vi.fn(), dismiss: vi.fn(), ack: vi.fn(), remember: vi.fn(), reassign: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: {
  addListener: vi.fn((name, callback) => { state.listeners.set(name, callback); }),
} }));
vi.mock('@/services/bookingAlertCoordinator', () => ({ processIncomingBooking: state.process, dismissAlert: state.dismiss }));
vi.mock('@/lib/scheduledBookingGuards', () => ({ logScheduledOfferDecision: vi.fn() }));
vi.mock('@/lib/bookingAck', () => ({ extractAckToken: (d: any) => d.ack_token, rememberAckToken: state.remember, ackBookingDelivery: state.ack }));
vi.mock('@/lib/fcmAckTracker', () => ({ trackFcmOffer: vi.fn() }));
vi.mock('@/lib/bookingReassign', () => ({ handleBookingReassigned: state.reassign }));

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); state.listeners.clear(); vi.resetModules(); });

it('both actual FCM listeners preserve the same deadline and signed token without live calls', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-12T07:00:00Z'));
  const { initFCM } = await import('../fcm'); await initFCM();
  const data = { type: 'BOOKING_ALERT', booking_id: 'b', booking_request_id: 'r', expires_at: '2026-11-12T07:01:00Z', customer: 'Alice', price: '200', ack_token: 'opaque-server-token' };
  await state.listeners.get('pushNotificationReceived')?.({ data });
  vi.setSystemTime(new Date('2026-11-12T07:00:55Z'));
  await state.listeners.get('pushNotificationActionPerformed')?.({ notification: { data } });
  expect(state.process).toHaveBeenCalledTimes(2);
  for (const [offer] of state.process.mock.calls) expect(offer).toMatchObject({ bookingId: 'b', bookingRequestId: 'r', timeoutAt: new Date(data.expires_at).toISOString(), custName: 'Alice', priceInr: 200, ackToken: 'opaque-server-token' });
  vi.setSystemTime(new Date('2026-11-12T07:01:00Z'));
  await state.listeners.get('pushNotificationActionPerformed')?.({ notification: { data } });
  expect(state.process).toHaveBeenCalledTimes(2);
});

it('cancellation, reassignment and informational taps never enter the offer coordinator', async () => {
  const { initFCM } = await import('../fcm'); await initFCM();
  const tap = state.listeners.get('pushNotificationActionPerformed');
  await tap?.({ notification: { data: { type: 'BOOKING_CANCELLED', booking_id: 'cancel' } } });
  await tap?.({ notification: { data: { type: 'BOOKING_REASSIGNED', booking_id: 'reassign' } } });
  await tap?.({ notification: { data: { type: 'BOOKING_ALERT', booking_id: 'info', actionable: false } } });
  expect(state.process).not.toHaveBeenCalled();
  expect(state.dismiss).toHaveBeenCalledWith('cancel');
  expect(state.reassign).toHaveBeenCalledWith('reassign', 'fcm-tap');
});