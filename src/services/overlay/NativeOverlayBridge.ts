import { OverlayBridge, BookingOverlayPayload } from './OverlayBridge';
import { Capacitor } from '@capacitor/core';

/**
 * Native implementation of OverlayBridge for Android
 * Uses Capacitor plugin to communicate with native overlay service
 */
export class NativeOverlayBridge implements OverlayBridge {
  private getPlugin(): any | null {
    if (!Capacitor.isNativePlatform()) return null;
    // @ts-ignore - Custom plugin
    return (window as any)?.Capacitor?.Plugins?.OverlayPlugin || null;
  }

  isSupported(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  async checkPermission(): Promise<boolean> {
    const plugin = this.getPlugin();
    if (!plugin?.checkPermission) {
      console.error('❌ OverlayPlugin.checkPermission not available');
      return false;
    }

    try {
      const result = await plugin.checkPermission();
      console.log('✅ Overlay permission check:', result);
      return !!result?.granted;
    } catch (error) {
      console.error('❌ Error checking overlay permission:', error);
      return false;
    }
  }

  async requestPermission(): Promise<boolean> {
    const plugin = this.getPlugin();
    if (!plugin?.requestPermission) {
      console.error('❌ OverlayPlugin.requestPermission not available');
      return false;
    }

    try {
      const result = await plugin.requestPermission();
      console.log('✅ Overlay permission requested:', result);
      return !!result?.granted;
    } catch (error) {
      console.error('❌ Error requesting overlay permission:', error);
      return false;
    }
  }

  async openOverlaySettings(): Promise<void> {
    const plugin = this.getPlugin();
    if (!plugin?.openOverlaySettings) {
      console.error('❌ OverlayPlugin.openOverlaySettings not available');
      return;
    }

    try {
      await plugin.openOverlaySettings();
      console.log('✅ Opened overlay settings');
    } catch (error) {
      console.error('❌ Error opening overlay settings:', error);
    }
  }

  async openBatteryOptimizationSettings(): Promise<void> {
    const plugin = this.getPlugin();
    if (!plugin?.openBatteryOptimizationSettings) {
      console.log('⚠️ Battery optimization settings not available on this device');
      return;
    }

    try {
      await plugin.openBatteryOptimizationSettings();
      console.log('✅ Opened battery optimization settings');
    } catch (error) {
      console.error('❌ Error opening battery optimization settings:', error);
    }
  }

  async showOverlay(payload: BookingOverlayPayload): Promise<void> {
    const plugin = this.getPlugin();
    if (!plugin?.showBookingOverlay) {
      console.error('❌ OverlayPlugin.showBookingOverlay not available');
      throw new Error('Overlay plugin not available');
    }

    try {
      // Check permission first
      const hasPermission = await this.checkPermission();
      if (!hasPermission) {
        console.warn('⚠️ Overlay permission not granted, requesting...');
        const granted = await this.requestPermission();
        if (!granted) {
          throw new Error('Overlay permission not granted');
        }
      }

      console.log('🚀 Showing booking overlay with payload:', payload);
      
      // Transform payload to match OverlayPlugin expectations (JSON string format)
      const bookingData = {
        id: payload.bookingId,
        cust_name: payload.customer,
        community: payload.location,
        service_type: payload.service,
        flat_no: payload.location,
        price_inr: payload.price
      };

      const bookingJson = JSON.stringify(bookingData);
      console.log('📦 Sending booking JSON to native:', bookingJson);

      await plugin.showBookingOverlay({ booking: bookingJson });
      console.log('✅ Overlay shown successfully');
    } catch (error) {
      console.error('❌ Error showing overlay:', error);
      throw error;
    }
  }

  async hideOverlay(): Promise<void> {
    const plugin = this.getPlugin();
    if (!plugin?.hideOverlay) {
      console.error('❌ OverlayPlugin.hideOverlay not available');
      return;
    }

    try {
      await plugin.hideOverlay();
      console.log('✅ Overlay hidden');
    } catch (error) {
      console.error('❌ Error hiding overlay:', error);
    }
  }
}
