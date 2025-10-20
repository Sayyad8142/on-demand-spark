/**
 * OverlayBridge Interface
 * Platform-agnostic overlay service for showing booking alerts
 */

export interface BookingOverlayPayload {
  bookingId: string;
  service: string;
  customer: string;
  location: string;
  price: number;
  timeoutSec?: number;
}

export interface OverlayBridge {
  /**
   * Check if overlay permission is granted
   */
  checkPermission(): Promise<boolean>;

  /**
   * Request overlay permission (Android only)
   */
  requestPermission(): Promise<boolean>;

  /**
   * Open system settings for overlay permission
   */
  openOverlaySettings(): Promise<void>;

  /**
   * Open battery optimization settings
   */
  openBatteryOptimizationSettings(): Promise<void>;

  /**
   * Show booking overlay/alert
   */
  showOverlay(payload: BookingOverlayPayload): Promise<void>;

  /**
   * Hide the overlay
   */
  hideOverlay(): Promise<void>;

  /**
   * Check if overlays are supported on this platform
   */
  isSupported(): boolean;
}
