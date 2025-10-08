import { Capacitor } from '@capacitor/core';

interface OverlayPlugin {
  requestOverlayPermission(): Promise<{ granted: boolean }>;
  showBookingOverlay(options: { booking: string }): Promise<void>;
  hideOverlay(): Promise<void>;
  checkOverlayPermission(): Promise<{ granted: boolean }>;
}

const Overlay = Capacitor.registerPlugin<OverlayPlugin>('Overlay');

export async function requestPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    console.log('Overlay: not Android, skipping permission request');
    return false;
  }

  try {
    const { granted } = await Overlay.requestOverlayPermission();
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
    const { granted } = await Overlay.checkOverlayPermission();
    return granted;
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
    await Overlay.showBookingOverlay({
      booking: JSON.stringify(booking)
    });
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
    await Overlay.hideOverlay();
    console.log('✅ Overlay hidden');
  } catch (error) {
    console.error('❌ Error hiding overlay:', error);
  }
}
