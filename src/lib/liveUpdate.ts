/**
 * OTA Live Update System
 * 
 * Downloads and applies new React/Vite bundles from Supabase Storage
 * without requiring a Play Store update.
 * 
 * Architecture:
 * - Supabase table `app_bundles` tracks available versions
 * - Supabase Storage bucket `ota-bundles` stores zip files
 * - On app launch, checks for newer version
 * - Downloads zip → extracts via native plugin → swaps WebView path → reloads
 * - Falls back to built-in bundle if anything fails
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
 * Download and apply a bundle update using the native LiveUpdate plugin
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

    // Call native plugin to download and extract
    const { LiveUpdatePlugin } = await import('@/native/liveUpdateBridge');
    
    const result = await LiveUpdatePlugin.downloadAndApply({
      url: bundleInfo.bundle_url,
      version: bundleInfo.version,
    });

    if (!result.success) {
      console.error('📦 OTA: Native download/apply failed:', result.error);
      onProgress?.('Update failed');
      // Mark this version as failed to avoid retry loops
      await Preferences.set({ key: OTA_CONFIG.PREF_FAILED_VERSION, value: bundleInfo.version });
      return false;
    }

    // Save the new version
    await Preferences.set({ key: OTA_CONFIG.PREF_BUNDLE_VERSION, value: bundleInfo.version });
    await Preferences.set({ key: OTA_CONFIG.PREF_BUNDLE_PATH, value: result.path || '' });
    // Clear any previous failure flag
    await Preferences.remove({ key: OTA_CONFIG.PREF_FAILED_VERSION });

    onProgress?.('Update applied! Reloading...');
    console.log('📦 OTA: Bundle applied successfully, reloading...');

    // Short delay then reload
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Reload the WebView to use the new bundle
    await LiveUpdatePlugin.reload();

    return true;
  } catch (err) {
    console.error('📦 OTA: Download/apply error:', err);
    onProgress?.('Update failed');
    await Preferences.set({ key: OTA_CONFIG.PREF_FAILED_VERSION, value: bundleInfo.version });
    return false;
  }
}

/**
 * Reset to the built-in bundle (shipped with APK)
 */
export async function resetToBuiltInBundle(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { LiveUpdatePlugin } = await import('@/native/liveUpdateBridge');
    await LiveUpdatePlugin.reset();
    await Preferences.remove({ key: OTA_CONFIG.PREF_BUNDLE_VERSION });
    await Preferences.remove({ key: OTA_CONFIG.PREF_BUNDLE_PATH });
    await Preferences.remove({ key: OTA_CONFIG.PREF_FAILED_VERSION });
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
    
    // Return result so App.tsx can handle mandatory updates
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
