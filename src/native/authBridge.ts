import { registerPlugin } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';

export interface AuthBridgePlugin {
  saveToken(options: { token: string }): Promise<{ ok: boolean }>;
  getToken(): Promise<{ token: string | null }>;
  clearToken(): Promise<{ ok: boolean }>;
}

const AuthBridge = registerPlugin<AuthBridgePlugin>('AuthBridge');

/**
 * Save JWT token to native storage for background booking acceptance
 */
export async function saveJWTToken(token: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    console.log('⚠️ AuthBridge: Not on native platform');
    return false;
  }

  // Retry up to 3 times with delays
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`💾 [Attempt ${attempt}/3] Saving JWT to native storage...`);
      console.log('🔑 Token preview:', token.substring(0, 50) + '...');
      
      await AuthBridge.saveToken({ token });
      
      // Wait a bit for the write to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify it was actually saved
      const verify = await AuthBridge.getToken();
      if (verify?.token === token) {
        console.log(`✅ JWT saved and verified successfully on attempt ${attempt}`);
        return true;
      } else {
        console.error(`❌ JWT verification failed on attempt ${attempt} - token mismatch!`);
      }
    } catch (error) {
      console.error(`❌ Failed to save JWT on attempt ${attempt}:`, error);
    }

    // Wait before retry (except on last attempt)
    if (attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  console.error('❌ Failed to save JWT after 3 attempts');
  return false;
}

/**
 * Get JWT token from native storage
 */
export async function getJWTToken(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  try {
    const result = await AuthBridge.getToken();
    return result.token;
  } catch (error) {
    console.error('❌ Failed to get JWT token:', error);
    return null;
  }
}

/**
 * Clear JWT token from native storage
 */
export async function clearJWTToken(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  try {
    const result = await AuthBridge.clearToken();
    return result.ok;
  } catch (error) {
    console.error('❌ Failed to clear JWT token:', error);
    return false;
  }
}
