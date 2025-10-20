import { Capacitor } from '@capacitor/core';
import { OverlayBridge } from './OverlayBridge';
import { WebOverlayBridge } from './WebOverlayBridge';
import { NativeOverlayBridge } from './NativeOverlayBridge';

/**
 * Get the appropriate overlay bridge for the current platform
 */
export function getOverlayBridge(): OverlayBridge {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    return new NativeOverlayBridge();
  } else {
    return new WebOverlayBridge();
  }
}

export * from './OverlayBridge';
export * from './WebOverlayBridge';
export * from './NativeOverlayBridge';
