import { Capacitor } from '@capacitor/core';

export async function requestAndroidOverlay() {
  if (!Capacitor.isNativePlatform()) return;
  
  // @ts-ignore - Custom plugin
  const { OverlayPlugin } = (window as any).Capacitor?.Plugins || {};
  if (!OverlayPlugin) {
    console.warn('OverlayPlugin not available');
    return;
  }
  
  try {
    const result = await OverlayPlugin.requestPermission();
    console.log('Overlay permission result:', result);
    return result;
  } catch (error) {
    console.error('Error requesting overlay permission:', error);
  }
}

export async function showBookingOverlayNative(payload: { 
  bookingId: string; 
  title: string; 
  body: string; 
}) {
  if (!Capacitor.isNativePlatform()) {
    console.log('Not native platform, skipping overlay');
    return;
  }
  
  console.log('Trigger native overlay via FCM payload', payload);
  
  // The overlay is typically triggered by FCM notification data
  // This function is here for future direct overlay triggers if needed
  // The BookingNotificationService in Android handles FCM -> overlay flow
}
