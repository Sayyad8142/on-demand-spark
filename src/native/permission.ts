import { Capacitor } from '@capacitor/core';

// @ts-ignore - Custom permission plugin
const PermissionPlugin = (window as any).Capacitor?.Plugins?.PermissionPlugin;

/**
 * Request notification permission with rationale dialog on Android
 */
export async function requestNotificationPermissionWithRationale(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !PermissionPlugin) {
    console.warn('⚠️ PermissionPlugin not available on this platform');
    return;
  }

  try {
    await PermissionPlugin.requestNotificationPermission();
    console.log('✅ Notification permission request initiated with rationale');
  } catch (error) {
    console.error('❌ Error requesting notification permission:', error);
  }
}

/**
 * Request location permission with rationale dialog on Android
 */
export async function requestLocationPermissionWithRationale(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !PermissionPlugin) {
    console.warn('⚠️ PermissionPlugin not available on this platform');
    return;
  }

  try {
    await PermissionPlugin.requestLocationPermission();
    console.log('✅ Location permission request initiated with rationale');
  } catch (error) {
    console.error('❌ Error requesting location permission:', error);
  }
}
