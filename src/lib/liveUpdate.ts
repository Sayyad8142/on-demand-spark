/**
 * OTA Live Update (hardened, delivery OFF by default — see OTA_DELIVERY_ENABLED).
 *
 * Rules (src/lib/otaSafety.ts + native LiveUpdatePlugin):
 * - Only HTTPS from the project's ota-bundles bucket; SHA-256 and size are required.
 * - Download goes to a staging folder; the screen is only switched when the worker is idle
 *   (no offer, no active booking, not on Start/End OTP, bookings loaded).
 * - "Mandatory" bundles never block the screen (forced updates stay off).
 * - A bundle that does not confirm a good start is rolled back and remembered as failed.
 *
 * What updates OTA: React components, styles, JS logic, assets.
 * What still needs Play Store: native Kotlin/Java, AndroidManifest, Gradle deps.
 */
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { supabase } from '@/integrations/supabase/client';
import { OTA_CONFIG } from '@/config/ota';
import { decideOta, OTA_DELIVERY_ENABLED, type OtaBundleRow, type OtaDecision } from '@/lib/otaSafety';
import type { WorkState } from '@/lib/workSafety';
import { logAppHealth } from '@/lib/appHealthLog';

const PREF_FAILED_LIST = 'ota_failed_versions_v2';

export async function getCurrentBundleVersion(): Promise<string> {
  const { value } = await Preferences.get({ key: OTA_CONFIG.PREF_BUNDLE_VERSION });
  return value || OTA_CONFIG.BUNDLE_VERSION;
}

async function nativePlugin() {
  return (await import('@/native/liveUpdateBridge')).DidiLiveUpdatePlugin;
}

/** Versions that failed here before (JS list + native rollback list). */
export async function getFailedVersions(): Promise<string[]> {
  const out = new Set<string>();
  try {
    const { value } = await Preferences.get({ key: PREF_FAILED_LIST });
    const arr = JSON.parse(value || '[]');
    if (Array.isArray(arr)) arr.forEach((v) => typeof v === 'string' && out.add(v));
    const legacy = (await Preferences.get({ key: OTA_CONFIG.PREF_FAILED_VERSION })).value;
    if (legacy) out.add(legacy);
  } catch { /* ignore */ }
  if (Capacitor.isNativePlatform()) {
    try { ((await (await nativePlugin()).getStatus()).failedVersions ?? []).forEach((v) => out.add(v)); } catch { /* old native build */ }
  }
  return [...out];
}

async function rememberFailed(version: string) {
  const list = new Set(await getFailedVersions());
  list.add(version);
  await Preferences.set({ key: PREF_FAILED_LIST, value: JSON.stringify([...list].slice(-20)) });
}

export async function fetchLatestBundle(): Promise<OtaBundleRow | null> {
  const { data, error } = await supabase
    .from('app_bundles')
    .select('version, bundle_url, sha256, size_bytes, is_mandatory')
    .eq('app_id', OTA_CONFIG.APP_ID)
    .eq('platform', OTA_CONFIG.PLATFORM)
    .eq('channel', OTA_CONFIG.CHANNEL)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as OtaBundleRow;
}

let busy = false;

/**
 * One OTA check. `getWork` is re-read right before switching, so an offer that arrives
 * during the download keeps the old screen. Returns the decision taken.
 */
export async function runOtaCycle(getWork: () => WorkState, enabled = OTA_DELIVERY_ENABLED): Promise<OtaDecision> {
  if (!enabled || !Capacitor.isNativePlatform()) return { action: 'none', why: 'disabled' };
  if (busy) return { action: 'wait' };
  busy = true;
  try {
    const [bundle, currentVersion, failedVersions] = await Promise.all([
      fetchLatestBundle().catch(() => null), getCurrentBundleVersion(), getFailedVersions(),
    ]);
    const decision = decideOta({ enabled, bundle, currentVersion, failedVersions, work: getWork() });
    if (decision.action === 'reject') logAppHealth('ota_rejected', decision.reasons.join(','));
    if (decision.action === 'wait') logAppHealth('ota_waiting');
    if (decision.action !== 'apply' || !bundle) return decision;

    const plugin = await nativePlugin();
    const staged = await plugin.downloadAndStage({
      url: bundle.bundle_url, version: bundle.version, sha256: bundle.sha256!, sizeBytes: bundle.size_bytes!,
    });
    if (!staged.success) {
      logAppHealth('ota_download_failed', staged.error);
      // Integrity/safety failures are remembered; plain network failures are retried later.
      if (staged.error && !/network|timeout|http_5/i.test(staged.error)) await rememberFailed(bundle.version);
      return { action: 'reject', reasons: [] };
    }
    // Re-check: an offer or booking may have arrived during the download.
    const again = decideOta({ enabled, bundle, currentVersion, failedVersions, work: getWork() });
    if (again.action !== 'apply') return again;
    await Preferences.set({ key: OTA_CONFIG.PREF_PENDING_VERSION, value: bundle.version });
    const act = await plugin.activateStaged();
    if (!act.success) { await Preferences.remove({ key: OTA_CONFIG.PREF_PENDING_VERSION }); return { action: 'wait' }; }
    logAppHealth('ota_applied', bundle.version);
    return again;
  } catch (err) {
    logAppHealth('ota_download_failed', err);
    return { action: 'none', why: 'no_bundle' };
  } finally {
    busy = false;
  }
}

/**
 * Called after React mounts. Confirms a pending bundle started fine, and records a
 * native rollback (bundle that crashed) so it is never retried.
 */
export async function markOtaBootSuccess(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const plugin = await nativePlugin();
    try {
      const st = await plugin.getStatus();
      if (st.lastRollbackReason) logAppHealth('ota_rolled_back', st.lastRollbackReason);
    } catch { /* old native build */ }
    const { value: pendingVersion } = await Preferences.get({ key: OTA_CONFIG.PREF_PENDING_VERSION });
    if (pendingVersion) {
      await Preferences.set({ key: OTA_CONFIG.PREF_BUNDLE_VERSION, value: pendingVersion });
      await Preferences.remove({ key: OTA_CONFIG.PREF_PENDING_VERSION });
    }
    await plugin.confirmBoot();
  } catch { /* never block startup */ }
}

export async function resetToBuiltInBundle(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await (await nativePlugin()).reset();
    for (const key of [OTA_CONFIG.PREF_BUNDLE_VERSION, OTA_CONFIG.PREF_BUNDLE_PATH, OTA_CONFIG.PREF_PENDING_VERSION]) {
      await Preferences.remove({ key });
    }
  } catch { /* ignore */ }
}
