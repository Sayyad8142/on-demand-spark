import { OverlayBridge, BookingOverlayPayload } from './OverlayBridge';

/**
 * Web implementation of OverlayBridge
 * Uses modal dialogs to simulate native overlays
 */
export class WebOverlayBridge implements OverlayBridge {
  private overlayCallback: ((payload: BookingOverlayPayload) => void) | null = null;

  isSupported(): boolean {
    return true; // Web modal fallback is always supported
  }

  async checkPermission(): Promise<boolean> {
    // Web doesn't need overlay permission
    return true;
  }

  async requestPermission(): Promise<boolean> {
    // Web doesn't need overlay permission
    return true;
  }

  async openOverlaySettings(): Promise<void> {
    console.log('⚠️ Overlay settings not applicable on web');
  }

  async openBatteryOptimizationSettings(): Promise<void> {
    console.log('⚠️ Battery optimization not applicable on web');
  }

  async showOverlay(payload: BookingOverlayPayload): Promise<void> {
    console.log('📱 Showing web overlay modal', payload);
    
    // Trigger callback if registered
    if (this.overlayCallback) {
      this.overlayCallback(payload);
    }
  }

  async hideOverlay(): Promise<void> {
    console.log('📱 Hiding web overlay modal');
  }

  /**
   * Register a callback to be called when overlay should be shown
   * This allows React components to handle the modal display
   */
  onShowOverlay(callback: (payload: BookingOverlayPayload) => void): () => void {
    this.overlayCallback = callback;
    return () => {
      this.overlayCallback = null;
    };
  }
}
