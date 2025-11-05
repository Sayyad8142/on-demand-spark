import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { Geolocation } from '@capacitor/geolocation';

let locationInterval: NodeJS.Timeout | null = null;
let isTrackingLocation = false;

/**
 * Request location permissions for foreground and background
 */
export async function requestLocationPermissions(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    console.log('Not a native platform, skipping location permissions');
    return false;
  }

  try {
    const permission = await Geolocation.requestPermissions({
      permissions: ['location', 'coarseLocation']
    });
    
    console.log('Location permissions:', permission);
    return permission.location === 'granted' || permission.coarseLocation === 'granted';
  } catch (error) {
    console.error('Error requesting location permissions:', error);
    return false;
  }
}

/**
 * Get current location with high accuracy
 */
export async function getCurrentLocation(): Promise<{ lat: number; lng: number; accuracy?: number } | null> {
  try {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });

    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy
    };
  } catch (error) {
    console.error('Error getting location:', error);
    return null;
  }
}

/**
 * Update worker location in database with geofence hysteresis
 */
async function updateWorkerLocation(lat: number, lng: number): Promise<any> {
  try {
    const { data, error } = await supabase.rpc('update_worker_location', {
      p_lat: lat,
      p_lng: lng
    });

    if (error) {
      console.error('Error updating worker location:', error);
      return null;
    }

    console.log('Location updated:', data);
    return data;
  } catch (error) {
    console.error('Exception updating location:', error);
    return null;
  }
}

/**
 * Start background location tracking (every 2 minutes)
 */
export async function startBackgroundLocationTracking(): Promise<boolean> {
  if (isTrackingLocation) {
    console.log('Location tracking already active');
    return true;
  }

  // Request permissions first
  const hasPermission = await requestLocationPermissions();
  if (!hasPermission) {
    console.error('Location permissions denied');
    return false;
  }

  // Get initial location
  const location = await getCurrentLocation();
  if (location) {
    await updateWorkerLocation(location.lat, location.lng);
  }

  // Start interval - update every 1 minute (more frequent updates)
  locationInterval = setInterval(async () => {
    console.log('📍 Automatic location update...');
    const loc = await getCurrentLocation();
    if (loc) {
      await updateWorkerLocation(loc.lat, loc.lng);
    }
  }, 60000); // 1 minute (60 seconds)

  isTrackingLocation = true;
  console.log('✅ Background location tracking started (1 min interval)');
  return true;
}

/**
 * Stop background location tracking
 */
export async function stopBackgroundLocationTracking() {
  if (locationInterval) {
    clearInterval(locationInterval);
    locationInterval = null;
  }

  isTrackingLocation = false;

  // Update location_enabled to false
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('workers')
        .update({ location_enabled: false })
        .eq('id', user.id);
    }
  } catch (error) {
    console.error('Error updating location_enabled:', error);
  }

  console.log('✅ Background location tracking stopped');
}

/**
 * Check if currently tracking location
 */
export function isLocationTracking(): boolean {
  return isTrackingLocation;
}

/**
 * Request to disable battery optimizations (Android)
 */
export async function requestBatteryOptimizationExemption() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return;
  }

  try {
    // Use native bridge to request battery optimization exemption
    const BatteryHelper = (window as any).BatteryOptimizationHelper;
    if (BatteryHelper && BatteryHelper.requestIgnoreBatteryOptimizations) {
      await BatteryHelper.requestIgnoreBatteryOptimizations();
      console.log('Battery optimization exemption requested');
    }
  } catch (error) {
    console.error('Error requesting battery optimization exemption:', error);
  }
}
