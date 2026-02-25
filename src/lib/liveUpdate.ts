/**
 * OTA Live Update System (hardened)
 * 
 * Downloads and applies new React/Vite bundles from Supabase Storage
 * without requiring a Play Store update.
 * 
 * Safety features:
 * - SHA-256 integrity check before extraction
 * - Boot health marker with automatic rollback
 * - Failed version tracking to avoid retry loops
 * - Graceful fallback to built-in bundle
 * 
 * What updates OTA: React components, Tailwind styles, JS logic, assets
 * What still needs Play Store: Native Kotlin/Java plugins, AndroidManifest, Gradle deps
 */

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { supabase } from '@/integrations/supabase/client';
import { OTA_CONFIG } from '@/config/ota';

export interface BundleInfo {
  id: string;
  app_id: string;
  platform: string;
  channel: string;
  version: string;
  bundle_url: string;
  is_mandatory: boolean;
  message: string | null;
  sha256: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  bundleInfo: BundleInfo | null;
  isMandatory: boolean;
}

/**
 * Get the currently installed OTA bundle version
 */
export async function getCurrentBundleVersion(): Promise<string> {
  const { value } = await Preferences.get({ key: OTA_CONFIG.PREF_BUNDLE_VERSION });
  return value || OTA_CONFIG.BUNDLE_VERSION;
}

/**
 * Check Supabase for available updates
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = await getCurrentBundleVersion();

  try {
    const { data, error } = await supabase
      .from('app_bundles')
      .select('*')
      .eq('app_id', OTA_CONFIG.APP_ID)
      .eq('platform', OTA_CONFIG.PLATFORM)
      .eq('channel', OTA_CONFIG.CHANNEL)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      console.log('📦 OTA: No bundles found or error:', error?.message);
      return {
        updateAvailable: false,
        currentVersion,
        latestVersion: null,
        bundleInfo: null,
        isMandatory: false,
      };
    }

    const latestVersion = data.version;
    const updateAvailable = isNewerVersion(latestVersion, currentVersion);

    // Check if this version previously failed
    const { value: failedVersion } = await Preferences.get({ key: OTA_CONFIG.PREF_FAILED_VERSION });
    if (failedVersion === latestVersion) {
      console.log('📦 OTA: Skipping version', latestVersion, '— previously failed');
      return {
        updateAvailable: false,
        currentVersion,
        latestVersion,
        bundleInfo: data as BundleInfo,
        isMandatory: false,
      };
    }

    console.log(`📦 OTA: Current=${currentVersion}, Latest=${latestVersion}, Update=${updateAvailable}`);

    return {
      updateAvailable,
      currentVersion,
      latestVersion,
      bundleInfo: data as BundleInfo,
      isMandatory: updateAvailable && data.is_mandatory,
    };
  } catch (err) {
    console.error('📦 OTA: Check failed:', err);
    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: null,
      bundleInfo: null,
      isMandatory: false,
    };
  }
}

/**
 * Download and apply a bundle update using the native DidiLiveUpdate plugin.
 * The native side handles SHA-256 verification if sha256 is provided.
 */
export async function downloadAndApplyUpdate(
  bundleInfo: BundleInfo,
  onProgress?: (status: string) => void
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    console.log('📦 OTA: Skipping on web platform');
    return false;
  }

  try {
    onProgress?.('Downloading update...');
    console.log('📦 OTA: Downloading bundle', bundleInfo.version, 'from', bundleInfo.bundle_url);

    const { DidiLiveUpdatePlugin } = await import('@/native/liveUpdateBridge');
    
    const result = await DidiLiveUpdatePlugin.downloadAndApply({
      url: bundleInfo.bundle_url,
      version: bundleInfo.version,
      sha256: bundleInfo.sha256 || undefined,
    });

    if (!result.success) {
      console.error('📦 OTA: Native download/apply failed:', result.error);
      onProgress?.('Update failed: ' + (result.error || 'unknown'));
      await Preferences.set({ key: OTA_CONFIG.PREF_FAILED_VERSION, value: bundleInfo.version });
      return false;
    }

    // Set pending version for boot health check — NOT confirmed until React loads
    await Preferences.set({ key: OTA_CONFIG.PREF_PENDING_VERSION, value: bundleInfo.version });
    await Preferences.set({ key: OTA_CONFIG.PREF_BUNDLE_PATH, value: result.path || '' });
    // Clear any previous failure flag
    await Preferences.remove({ key: OTA_CONFIG.PREF_FAILED_VERSION });

    onProgress?.('Update applied! Reloading...');
    console.log('📦 OTA: Bundle applied, pending boot confirmation, reloading...');

    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Reload the WebView via setServerBasePath + reload (no direct loadUrl)
    await DidiLiveUpdatePlugin.reload();

    return true;
  } catch (err) {
    console.error('📦 OTA: Download/apply error:', err);
    onProgress?.('Update failed');
    await Preferences.set({ key: OTA_CONFIG.PREF_FAILED_VERSION, value: bundleInfo.version });
    return false;
  }
}

/**
 * Called by App.tsx after React successfully mounts.
 * Confirms the OTA boot was successful and promotes pending → confirmed version.
 * If pending version exists but React crashed before calling this, the native side
 * will roll back on next launch.
 */
export async function markOtaBootSuccess(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { value: pendingVersion } = await Preferences.get({ key: OTA_CONFIG.PREF_PENDING_VERSION });
    
    if (pendingVersion) {
      // Promote pending → confirmed
      await Preferences.set({ key: OTA_CONFIG.PREF_BUNDLE_VERSION, value: pendingVersion });
      await Preferences.remove({ key: OTA_CONFIG.PREF_PENDING_VERSION });
      
      // Tell native side boot is confirmed
      const { DidiLiveUpdatePlugin } = await import('@/native/liveUpdateBridge');
      await DidiLiveUpdatePlugin.confirmBoot();
      
      console.log('📦 OTA: Boot confirmed for version', pendingVersion);
    }
  } catch (err) {
    console.error('📦 OTA: markOtaBootSuccess error:', err);
  }
}

/**
 * Reset to the built-in bundle (shipped with APK)
 */
export async function resetToBuiltInBundle(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { DidiLiveUpdatePlugin } = await import('@/native/liveUpdateBridge');
    await DidiLiveUpdatePlugin.reset();
    await Preferences.remove({ key: OTA_CONFIG.PREF_BUNDLE_VERSION });
    await Preferences.remove({ key: OTA_CONFIG.PREF_BUNDLE_PATH });
    await Preferences.remove({ key: OTA_CONFIG.PREF_FAILED_VERSION });
    await Preferences.remove({ key: OTA_CONFIG.PREF_PENDING_VERSION });
    console.log('📦 OTA: Reset to built-in bundle');
  } catch (err) {
    console.error('📦 OTA: Reset failed:', err);
  }
}

/**
 * Run OTA check on app startup (non-blocking for non-mandatory updates)
 */
export async function initOtaCheck(): Promise<UpdateCheckResult | null> {
  if (!Capacitor.isNativePlatform()) return null;

  try {
    const result = await checkForUpdate();
    
    if (result.updateAvailable && !result.isMandatory) {
      // Non-mandatory: auto-download in background
      console.log('📦 OTA: Non-mandatory update available, downloading in background...');
      downloadAndApplyUpdate(result.bundleInfo!).catch(err => {
        console.error('📦 OTA: Background update failed:', err);
      });
    }
    
    return result;
  } catch (err) {
    console.error('📦 OTA: Init check failed:', err);
    return null;
  }
}

/**
 * Compare semantic versions: returns true if versionA > versionB
 */
function isNewerVersion(versionA: string, versionB: string): boolean {
  const partsA = versionA.split('.').map(Number);
  const partsB = versionB.split('.').map(Number);
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const a = partsA[i] || 0;
    const b = partsB[i] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}
