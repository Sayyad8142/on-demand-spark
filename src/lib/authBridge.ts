import { Capacitor } from "@capacitor/core";
import { Session } from "@supabase/supabase-js";

type SessionData = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch milliseconds
  userId: string;
};

function getAuthBridge() {
  if (!Capacitor.isNativePlatform()) {
    console.log("🔐 Not on native platform, skipping AuthBridge");
    return null;
  }
  // @ts-ignore - Capacitor plugin
  const bridge = (window as any)?.Capacitor?.Plugins?.AuthBridge;
  if (!bridge) {
    console.error("❌ AuthBridge plugin not found! Make sure to rebuild and sync.");
  }
  return bridge;
}

export async function saveSessionToNative(session: Session | null) {
  const bridge = getAuthBridge();
  if (!bridge) {
    console.warn("⚠️ AuthBridge not available, session NOT saved to native");
    return false;
  }

  if (!session?.access_token) {
    console.log("🔐 No session to save, clearing native session");
    await bridge.clearSession();
    return false;
  }

  // Convert Supabase seconds → milliseconds
  const expiresAtSec = session.expires_at ?? Math.floor(Date.now() / 1000) + 3600;
  const expiresAtMs = expiresAtSec * 1000;  // ✅ Convert to milliseconds
  
  const now = Date.now();
  const timeUntilExpiry = expiresAtMs - now;
  const hoursUntilExpiry = (timeUntilExpiry / (1000 * 60 * 60)).toFixed(1);

  const sessionData: SessionData = {
    accessToken: session.access_token,
    refreshToken: session.refresh_token ?? "",
    expiresAt: expiresAtMs,  // ✅ Store milliseconds
    userId: session.user?.id ?? "",
  };

  console.log("🔐 WEB → Saving session to native bridge:");
  console.log("   - userId:", sessionData.userId);
  console.log("   - accessToken (first 20 chars):", sessionData.accessToken.substring(0, 20) + "...");
  console.log("   - token length:", sessionData.accessToken.length);
  console.log("   - expiresAtMs:", expiresAtMs);
  console.log("   - now:", now);
  console.log("   - expires in:", hoursUntilExpiry, "hours");
  console.log("   - Supabase session.expires_at (seconds):", session.expires_at);
  
  try {
    const result = await bridge.setSession(sessionData);
    console.log("✅ WEB → Session saved to native successfully:", result);
    
    // CRITICAL: Wait a moment for SharedPreferences to persist
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify by reading back immediately
    const verification = await bridge.getSession();
    console.log("🔍 WEB → Verifying saved session:");
    console.log("   - returned userId:", verification.userId);
    console.log("   - returned token length:", verification.accessToken?.length ?? 0);
    console.log("   - returned expiresAt:", verification.expiresAt);
    
    // Verify token matches
    if (verification.accessToken !== sessionData.accessToken) {
      console.error("❌ CRITICAL: Token mismatch after save! Saved length:", sessionData.accessToken.length, "Read length:", verification.accessToken?.length);
      return false;
    }
    
    if (!verification.userId || !verification.accessToken || verification.expiresAt === 0) {
      console.error("❌ CRITICAL: Session verification failed! Data not persisted correctly.");
      return false;
    }
    
    console.log("✅ Session verification PASSED");
    return true;
  } catch (error) {
    console.error("❌ WEB → Failed to save session to native:", error);
    return false;
  }
}

export async function clearSessionFromNative() {
  const bridge = getAuthBridge();
  if (!bridge) return;

  console.log("🗑️ Clearing session from native bridge");
  await bridge.clearSession();
}

export async function getSessionFromNative(): Promise<SessionData | null> {
  const bridge = getAuthBridge();
  if (!bridge) return null;

  try {
    const result = await bridge.getSession();
    if (!result?.accessToken) return null;
    return result as SessionData;
  } catch (error) {
    console.error("❌ Failed to get session from native:", error);
    return null;
  }
}
