import { Capacitor } from '@capacitor/core';
import { requestAndroidOverlay as requestOverlayPermission } from '@/native/overlay';

export async function requestAndroidOverlay() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return;
  }
  
  console.log('📱 Requesting Android overlay permission...');
  await requestOverlayPermission();
}
