import { Capacitor } from "@capacitor/core";

type SessionPayload = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  expiresAt: number; // epoch seconds
};

/**
 * Get OverlayAuth plugin from Capacitor bridge
 */
function getOverlayAuth() {
  // Capacitor v6/7 exposes via window.Capacitor.Plugins or direct window access
  // @ts-ignore
  return (window?.Capacitor?.Plugins?.OverlayAuth) || (window as any)?.OverlayAuth;
}

/**
 * Save Supabase session to native Android storage
 * This allows the native overlay to access auth tokens
 */
export async function saveSessionToNative(payload: SessionPayload) {
  if (!Capacitor.isNativePlatform()) {
    console.log('⚠️ Not native platform, skipping session save');
    return false;
  }

  try {
    const OverlayAuth = getOverlayAuth();
    
    if (!OverlayAuth?.saveSession) {
      console.error('❌ OverlayAuth plugin not available');
      return false;
    }

    console.log('💾 Saving session to native storage...');
    console.log('🔑 Access token preview:', payload.accessToken.substring(0, 50) + '...');
    console.log('👤 User ID:', payload.userId);
    console.log('⏰ Expires at:', new Date(payload.expiresAt * 1000).toISOString());
    
    await OverlayAuth.saveSession(payload);
    
    console.log('✅ Session saved to native storage successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to save session to native:', error);
    return false;
  }
}

/**
 * Clear session from native storage (on logout)
 */
export async function clearSessionFromNative() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const OverlayAuth = getOverlayAuth();
    
    if (OverlayAuth?.clearSession) {
      await OverlayAuth.clearSession();
      console.log('🗑️ Session cleared from native storage');
    }
  } catch (error) {
    console.error('❌ Failed to clear session from native:', error);
  }
}
