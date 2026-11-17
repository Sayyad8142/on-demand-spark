import { PushService } from './PushService';
import { PushNotifications } from '@capacitor/push-notifications';
import { syncTokenToBackend, waitForNativeFcmToken } from '@/lib/pushToken';

/**
 * Native Push Service for Capacitor/Android
 * This implementation uses Capacitor's Push Notifications plugin
 */
export class NativePushService implements PushService {
  isSupported(): boolean {
    return true; // Native always supports push
  }

  async requestPermission(): Promise<boolean> {
    try {
      const result = await PushNotifications.requestPermissions();
      return result.receive === 'granted';
    } catch (error) {
      console.error('❌ Error requesting push permission:', error);
      return false;
    }
  }

  async getToken(): Promise<string | null> {
    return waitForNativeFcmToken({ reason: 'native-push-service' });
  }

  async registerToken(token: string, userId: string): Promise<void> {
    if (!(await syncTokenToBackend(token, userId, 'native-push-service'))) {
      throw new Error('Failed to sync notification token');
    }
  }

  onMessage(handler: (payload: any) => void): () => void {
    const listener = PushNotifications.addListener('pushNotificationReceived', handler);
    
    return () => {
      void listener.then(handle => handle.remove());
    };
  }
}
