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
  // Foreground service removed - no longer needed
  console.log('Foreground service: disabled');
}

export async function stopForegroundService() {
  // Foreground service removed - no longer needed
  console.log('Foreground service: disabled');
}
