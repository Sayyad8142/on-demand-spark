/**
 * Bridge to native LiveUpdatePlugin (Android)
 * Handles downloading zip bundles, extracting, and swapping WebView path
 */
import { registerPlugin } from '@capacitor/core';

interface LiveUpdatePluginInterface {
  downloadAndApply(options: { url: string; version: string }): Promise<{ success: boolean; path?: string; error?: string }>;
  reload(): Promise<void>;
  reset(): Promise<void>;
  getCurrentPath(): Promise<{ path: string }>;
}

export const LiveUpdatePlugin = registerPlugin<LiveUpdatePluginInterface>('LiveUpdate');
