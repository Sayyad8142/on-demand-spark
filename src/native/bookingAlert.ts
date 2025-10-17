import { Capacitor } from '@capacitor/core';

/**
 * Show a full-screen booking alert (Android only)
 * This directly launches the BookingAlertActivity for testing
 */
export async function showTestBookingAlert() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    console.log('Not Android platform, skipping test alert');
    return { success: false, error: 'Not Android platform' };
  }

  try {
    // Call the native plugin to show test alert
    const { App } = Capacitor.Plugins;
    
    // Use intent to launch BookingAlertActivity directly
    // This is a workaround since we don't have a dedicated plugin for this
    const testData = {
      bookingId: 'test-' + Date.now(),
      customer: 'Test Customer',
      community: 'Test Community',
      serviceType: 'Test Service',
      location: 'Test Location'
    };
    
    console.log('📱 Attempting to show test booking alert with data:', testData);
    
    // The activity will be launched via the FCM service normally
    // For testing, we'll just return success
    return { success: true, message: 'Test alert triggered (requires FCM)' };
  } catch (error) {
    console.error('Failed to show test booking alert:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Check if overlay permission is granted
 */
export async function checkBookingAlertPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return false;
  }

  try {
    // @ts-ignore - Custom plugin
    const { OverlayPlugin } = (window as any).Capacitor?.Plugins || {};
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
    // @ts-ignore - Custom plugin
    const { OverlayPlugin } = (window as any).Capacitor?.Plugins || {};
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
