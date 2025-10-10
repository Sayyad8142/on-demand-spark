import { Capacitor } from '@capacitor/core';
import { requestAndroidOverlay, showBookingOverlayNative } from '@/native/overlay';

export async function requestPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    console.log('Overlay: not Android, skipping permission request');
    return false;
  }

  try {
    const result = await requestAndroidOverlay();
    const granted = result?.granted || false;
    console.log('✅ Overlay permission granted:', granted);
    return granted;
  } catch (error) {
    console.error('❌ Error requesting overlay permission:', error);
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

export async function enableOverlayMode(): Promise<void> {
  // Overlay mode is enabled by the foreground service
  // This function just stores the preference
  const prefs = localStorage.getItem('overlay_mode');
  if (!prefs) {
    localStorage.setItem('overlay_mode', 'enabled');
    console.log('✅ Overlay mode enabled');
  }
}

export async function disableOverlayMode(): Promise<void> {
  localStorage.removeItem('overlay_mode');
  console.log('✅ Overlay mode disabled');
}

export function isOverlayModeEnabled(): boolean {
  return localStorage.getItem('overlay_mode') === 'enabled';
}

export async function showBookingOverlay(booking: any): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    console.log('Overlay: not Android, skipping overlay display');
    return;
  }

  try {
    const payload = {
      bookingId: booking.id || '',
      title: `New ${booking.service_type || 'Booking'}`,
      body: `${booking.community || ''} • ${booking.flat_no || ''} • ₹${booking.price_inr || 0}`
    };
    
    await showBookingOverlayNative(payload);
    console.log('✅ Booking overlay shown');
  } catch (error) {
    console.error('❌ Error showing booking overlay:', error);
  }
}

export async function hideOverlay(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return;
  }

  try {
    // The Android service will handle hiding the overlay
    console.log('✅ Overlay hide requested');
  } catch (error) {
    console.error('❌ Error hiding overlay:', error);
  }
}
