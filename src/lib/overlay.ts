import { Capacitor } from '@capacitor/core';

export async function requestAndroidOverlay(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    console.log('Overlay: not Android, skipping permission request');
    return false;
  }
  try {
    // @ts-ignore custom plugin access
    const { OverlayPlugin } = (window as any).Capacitor?.Plugins || {};
    if (OverlayPlugin?.requestPermission) {
      const out = await OverlayPlugin.requestPermission();
      return !!(out?.granted || out?.requested); // treat requested as success prompt
    }
    return false;
  } catch (e) {
    console.error('Overlay permission error:', e);
    return false;
  }
}

export async function checkPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return false;
  }

  try {
    // @ts-ignore - Custom plugin
    const { OverlayPlugin } = (window as any).Capacitor?.Plugins || {};
    if (OverlayPlugin && OverlayPlugin.checkPermission) {
      const { granted } = await OverlayPlugin.checkPermission();
      return granted;
    }
    return false;
  } catch (error) {
    console.error('❌ Error checking overlay permission:', error);
    return false;
  }
}


export async function showBookingOverlay(booking: any): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  try {
    const payload = {
      bookingId: booking.id || '',
      title: `New ${booking.service_type || 'Booking'}`,
      body: `${booking.community || ''} • ${booking.flat_no || ''} • ₹${booking.price_inr || 0}`,
    };
    // @ts-ignore implemented in src/native/overlay.ts
    await (await import('@/native/overlay')).showBookingOverlayNative(payload);
  } catch (e) {
    console.error('Overlay show error:', e);
  }
}

export async function hideOverlay(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  console.log('Overlay hide requested (handled by native service)');
}
