import { OverlayBridge, BookingOverlayPayload } from './OverlayBridge';
import { Capacitor } from '@capacitor/core';

/**
 * Native implementation of OverlayBridge for Android
 * Uses Capacitor plugin to communicate with native overlay service
 */
export class NativeOverlayBridge implements OverlayBridge {
  isSupported(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  async checkPermission(): Promise<boolean> {
    console.log('⚠️ Native overlay not yet implemented');
    return false;
  }

  async requestPermission(): Promise<boolean> {
    console.log('⚠️ Native overlay not yet implemented');
    return false;
  }

  async openOverlaySettings(): Promise<void> {
    console.log('⚠️ Native overlay not yet implemented');
  }

  async openBatteryOptimizationSettings(): Promise<void> {
    console.log('⚠️ Native overlay not yet implemented');
  }

  async showOverlay(payload: BookingOverlayPayload): Promise<void> {
    console.log('⚠️ Native overlay not yet implemented', payload);
  }

  async hideOverlay(): Promise<void> {
    console.log('⚠️ Native overlay not yet implemented');
  }
}
