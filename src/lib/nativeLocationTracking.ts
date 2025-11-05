import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

interface LocationPlugin {
  startLocationTracking(): Promise<{ success: boolean }>;
  stopLocationTracking(): Promise<{ success: boolean }>;
  isLocationTracking(): Promise<{ isTracking: boolean }>;
  saveJwtToken(options: { token: string }): Promise<{ success: boolean }>;
  requestBatteryOptimization(): Promise<{ success: boolean }>;
}

const LocationPluginInstance = Capacitor.isNativePlatform()
  ? (Capacitor as any).Plugins.LocationPlugin as LocationPlugin
  : null;

/**
 * Start native background location tracking service
 * This will continue tracking even when app is closed/minimized
 */
export async function startNativeLocationTracking(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !LocationPluginInstance) {
    console.log('Native location tracking not available on web');
    return false;
  }

  try {
    // Get current JWT token and save it to native storage
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      await LocationPluginInstance.saveJwtToken({ token: session.access_token });
      console.log('JWT token saved to native storage');
    }

    // Start the native location tracking service
    const result = await LocationPluginInstance.startLocationTracking();
    console.log('Native location tracking started:', result);
    
    return result.success;
  } catch (error) {
    console.error('Error starting native location tracking:', error);
    return false;
  }
}

/**
 * Stop native background location tracking service
 */
export async function stopNativeLocationTracking(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !LocationPluginInstance) {
    console.log('Native location tracking not available on web');
    return false;
  }

  try {
    const result = await LocationPluginInstance.stopLocationTracking();
    console.log('Native location tracking stopped:', result);
    return result.success;
  } catch (error) {
    console.error('Error stopping native location tracking:', error);
    return false;
  }
}

/**
 * Check if native location tracking is currently active
 */
export async function isNativeLocationTracking(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !LocationPluginInstance) {
    return false;
  }

  try {
    const result = await LocationPluginInstance.isLocationTracking();
    return result.isTracking;
  } catch (error) {
    console.error('Error checking location tracking status:', error);
    return false;
  }
}

/**
 * Request battery optimization exemption for uninterrupted background tracking
 */
export async function requestBatteryOptimization(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !LocationPluginInstance) {
    return;
  }

  try {
    await LocationPluginInstance.requestBatteryOptimization();
  } catch (error) {
    console.error('Error requesting battery optimization:', error);
  }
}
