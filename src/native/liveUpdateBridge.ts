/**
 * Bridge to native DidiLiveUpdate plugin (Android)
 * Handles downloading zip bundles, extracting, swapping WebView path, and integrity checks
 */
import { registerPlugin } from '@capacitor/core';

interface DidiLiveUpdatePluginInterface {
  downloadAndApply(options: { url: string; version: string; sha256?: string }): Promise<{ success: boolean; path?: string; error?: string }>;
  reload(): Promise<void>;
  reset(): Promise<void>;
  getCurrentPath(): Promise<{ path: string }>;
  confirmBoot(): Promise<void>;
}

export const DidiLiveUpdatePlugin = registerPlugin<DidiLiveUpdatePluginInterface>('DidiLiveUpdate');
