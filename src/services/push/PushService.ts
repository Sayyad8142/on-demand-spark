/**
 * PushService Interface
 * Platform-agnostic push notification service
 */

export interface PushServiceConfig {
  vapidPublicKey?: string;
}

export interface PushService {
  /**
   * Request permission to show push notifications
   */
  requestPermission(): Promise<boolean>;

  /**
   * Get the current push token
   */
  getToken(): Promise<string | null>;

  /**
   * Register the token with the backend
   */
  registerToken(token: string, userId: string): Promise<void>;

  /**
   * Listen for foreground messages (web only)
   */
  onMessage(handler: (payload: any) => void): () => void;

  /**
   * Check if push notifications are supported
   */
  isSupported(): boolean;
}
