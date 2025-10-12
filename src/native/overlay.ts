import { Capacitor } from '@capacitor/core';

type OverlayPermissionResult = { granted: boolean };

function getPlugin(): any | null {
  // @ts-ignore
  return (window as any)?.Capacitor?.Plugins?.OverlayPlugin || null;
}

export async function checkOverlayPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const plugin = getPlugin();
  if (!plugin || !plugin.checkPermission) return false;
  try {
    const res = (await plugin.checkPermission()) as OverlayPermissionResult;
    return !!res?.granted;
  } catch (error) {
    console.error('Error checking overlay permission:', error);
    return false;
  }
}

export async function requestOverlayPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const plugin = getPlugin();
  if (!plugin || !plugin.requestPermission) return false;
  try {
    const res = (await plugin.requestPermission()) as OverlayPermissionResult;
    return !!res?.granted;
  } catch (error) {
    console.error('Error requesting overlay permission:', error);
    return false;
  }
}

// Legacy function name for backward compatibility
export async function requestAndroidOverlay(): Promise<boolean> {
  return requestOverlayPermission();
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

export async function openAndroidOverlaySettings(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    console.log('Not Android platform, skipping overlay settings');
    return;
  }
  
  // @ts-ignore - Custom plugin
  const { OverlayPlugin } = (window as any).Capacitor?.Plugins || {};
  if (OverlayPlugin?.openOverlaySettings) {
    await OverlayPlugin.openOverlaySettings();
  }
}
