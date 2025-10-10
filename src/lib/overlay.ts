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
  
  const payload = {
    bookingId: booking.id || '',
    title: `New ${booking.service_type || 'Booking'}`,
    body: `${booking.community || ''} • ${booking.flat_no || ''} • ₹${booking.price_inr || 0}`,
  };
  
  console.log('Trigger native overlay via FCM payload', payload);
  // The overlay is triggered by FCM notification data
  // The BookingNotificationService in Android handles FCM -> overlay flow
}

export async function hideOverlay(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  console.log('Overlay hide requested (handled by native service)');
}
