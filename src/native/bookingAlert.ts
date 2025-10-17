import { Capacitor } from '@capacitor/core';

/**
 * Show a full-screen booking alert (Android only)
 * Note: This function is a placeholder. The actual booking alerts
 * are triggered by FCM push notifications from the backend.
 */
export async function showTestBookingAlert() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    console.log('Not Android platform, skipping test alert');
    return { success: false, error: 'Not Android platform' };
  }

  console.log('📱 Test booking alert requested');
  console.log('⚠️  Real alerts are triggered by FCM notifications from the backend');
  
  return { 
    success: true, 
    message: 'Test overlay feature requires actual FCM notification from backend' 
  };
}

/**
 * Check if overlay permission is granted
 */
export async function checkBookingAlertPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return false;
  }

  try {
    const { OverlayPlugin } = (window as any);
    if (OverlayPlugin?.checkPermission) {
      const result = await OverlayPlugin.checkPermission();
      return !!result?.granted;
    }
    return false;
  } catch (error) {
    console.error('Error checking booking alert permission:', error);
    return false;
  }
}

/**
 * Request overlay permission (required for showing booking alerts)
 */
export async function requestBookingAlertPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return false;
  }

  try {
    const { OverlayPlugin } = (window as any);
    if (OverlayPlugin?.requestPermission) {
      const result = await OverlayPlugin.requestPermission();
      return !!result?.granted;
    }
    return false;
  } catch (error) {
    console.error('Error requesting booking alert permission:', error);
    return false;
  }
}
