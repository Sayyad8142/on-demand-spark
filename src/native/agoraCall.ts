import { registerPlugin, Capacitor } from "@capacitor/core";

export interface AgoraCallPlugin {
  init(options: { appId: string }): Promise<void>;
  join(options: { token: string; channel: string; uid: number }): Promise<void>;
  leave(): Promise<void>;
  destroy(): Promise<void>;
  setMuted(options: { muted: boolean }): Promise<{ muted: boolean }>;
  setSpeaker(options: { on: boolean }): Promise<{ speaker: boolean }>;
  addListener(event: string, cb: (data: any) => void): Promise<{ remove: () => Promise<void> }>;
}

const Native = registerPlugin<AgoraCallPlugin>("AgoraCall");

export const AgoraCall = Native;

export const isAgoraAvailable = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

/**
 * Derive a stable uint32 UID from any string (worker UUID, booking id, etc.).
 * Agora requires a numeric uid; this gives us deterministic uniqueness per
 * worker without storing a separate mapping.
 */
export function stableUid(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  // Force positive 31-bit (Agora uses uint32; keep below 2^31 for safety)
  return Math.abs(h) % 2_000_000_000;
}
