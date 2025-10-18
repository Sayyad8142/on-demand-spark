import { Capacitor } from '@capacitor/core';

/**
 * Show a full-screen booking alert (Android only)
 * This triggers the native overlay service with test data
 */
export async function showTestBookingAlert() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    console.log('Not Android platform, skipping test alert');
    return { success: false, error: 'Not Android platform' };
  }

  console.log('📱 Test booking alert requested - triggering native overlay');
  
  try {
    const { OverlayPlugin } = (window as any).Capacitor?.Plugins || {};
    
    if (!OverlayPlugin?.showBookingOverlay) {
      console.error('❌ OverlayPlugin.showBookingOverlay not available');
      return { success: false, error: 'OverlayPlugin not available' };
    }

    // Trigger the native overlay with test booking data
    const testBookingData = {
      bookingId: 'test-' + Date.now(),
      customer: 'Test Customer',
      community: 'Test Community',
      serviceType: 'Snow Removal',
      location: 'A-101',
      price: 50
    };

    console.log('🚀 Calling OverlayPlugin.showBookingOverlay with data:', testBookingData);
    await OverlayPlugin.showBookingOverlay(testBookingData);
    
    console.log('✅ Overlay triggered successfully');
    return { 
      success: true, 
      message: 'Test overlay triggered - check your device screen' 
    };
  } catch (error) {
    console.error('❌ Error triggering test overlay:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
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
