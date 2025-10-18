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
  console.log('🔵 showBookingOverlay called with booking:', booking);
  
  if (!Capacitor.isNativePlatform()) {
    console.error('❌ Not a native platform');
    throw new Error('Not a native platform');
  }
  
  if (Capacitor.getPlatform() !== 'android') {
    console.error('❌ Not Android platform');
    throw new Error('Not Android platform');
  }
  
  console.log('✅ Platform check passed - is Android native');
  
  try {
    // @ts-ignore - Custom plugin
    const { OverlayPlugin } = (window as any).Capacitor?.Plugins || {};
    console.log('🔌 OverlayPlugin:', OverlayPlugin ? 'Found' : 'Not found');
    console.log('🔌 showBookingOverlay method:', OverlayPlugin?.showBookingOverlay ? 'Available' : 'Not available');
    
    if (!OverlayPlugin?.showBookingOverlay) {
      console.error('❌ OverlayPlugin.showBookingOverlay not available');
      throw new Error('OverlayPlugin.showBookingOverlay not available');
    }

    const bookingData = {
      id: booking.id || '',
      service_type: booking.service_type || 'Service',
      cust_name: booking.cust_name || 'Customer',
      community: booking.community || '',
      flat_no: booking.flat_no || '',
      price_inr: booking.price_inr || 0,
    };

    const bookingJson = JSON.stringify(bookingData);
    console.log('📦 Booking data prepared:', bookingData);
    console.log('📦 Booking JSON:', bookingJson);
    console.log('📱 Calling OverlayPlugin.showBookingOverlay...');
    
    const result = await OverlayPlugin.showBookingOverlay({ booking: bookingJson });
    
    console.log('✅ Native overlay triggered successfully, result:', result);
  } catch (error) {
    console.error('❌ Error showing booking overlay:', error);
    console.error('❌ Error details:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function hideOverlay(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  console.log('Overlay hide requested (handled by native service)');
}
