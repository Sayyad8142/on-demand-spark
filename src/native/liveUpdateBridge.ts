/**
 * Bridge to the native DidiLiveUpdate plugin (Android).
 * Native side re-checks every rule (HTTPS allow-list, required SHA-256, size, safe ZIP,
 * no active offer) and never trusts the values sent from here.
 */
import { registerPlugin } from '@capacitor/core';

export interface OtaNativeStatus {
  activeVersion?: string | null;
  pendingVersion?: string | null;
  stagedVersion?: string | null;
  failedVersions?: string[];
  lastRollbackReason?: string | null;
}

interface DidiLiveUpdatePluginInterface {
  /** Download + verify + extract into a staging folder. Does NOT reload or switch the screen. */
  downloadAndStage(options: { url: string; version: string; sha256: string; sizeBytes: number }): Promise<{ success: boolean; error?: string }>;
  /** Switch to the staged bundle (reloads). Refused natively while an offer is queued or the phone is busy. */
  activateStaged(): Promise<{ success: boolean; error?: string }>;
  reset(): Promise<void>;
  getCurrentPath(): Promise<{ path: string }>;
  getStatus(): Promise<OtaNativeStatus>;
  confirmBoot(): Promise<void>;
}

export const DidiLiveUpdatePlugin = registerPlugin<DidiLiveUpdatePluginInterface>('DidiLiveUpdate');
