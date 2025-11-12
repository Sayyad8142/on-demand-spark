import { Capacitor } from '@capacitor/core';

declare global {
  interface Window {
    ForegroundService?: {
      start: () => Promise<void>;
      stop: () => Promise<void>;
    };
  }
}

export async function startForegroundService() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    console.log('Foreground service: not Android, skipping');
    return;
  }

  try {
    // Use Capacitor plugin bridge to start the service
    const ForegroundService = (window as any).ForegroundService;
    if (ForegroundService && ForegroundService.start) {
      await ForegroundService.start();
      console.log('✅ Foreground service started');
    } else {
      console.warn('⚠️ ForegroundService plugin not available');
    }
  } catch (error) {
    console.error('❌ Error starting foreground service:', error);
  }
}

export async function stopForegroundService() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    console.log('Foreground service: not Android, skipping');
    return;
  }

  try {
    const ForegroundService = (window as any).ForegroundService;
    if (ForegroundService && ForegroundService.stop) {
      await ForegroundService.stop();
      console.log('✅ Foreground service stopped');
    }
  } catch (error) {
    console.error('❌ Error stopping foreground service:', error);
  }
}
