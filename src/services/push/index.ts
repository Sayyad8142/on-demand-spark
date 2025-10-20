import { Capacitor } from '@capacitor/core';
import { PushService } from './PushService';
import { WebPushService } from './WebPushService';
import { NativePushService } from './NativePushService';

/**
 * Get the appropriate push service for the current platform
 */
export function getPushService(): PushService {
  if (Capacitor.isNativePlatform()) {
    return new NativePushService();
  } else {
    return new WebPushService();
  }
}

export * from './PushService';
export * from './WebPushService';
export * from './NativePushService';
