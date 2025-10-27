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
    return;
  }

  if (!session?.access_token) {
    console.log("🔐 No session to save, clearing native session");
    await bridge.clearSession();
    return;
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

  console.log("🔐 Saving session to native bridge:");
  console.log("   - userId:", sessionData.userId);
  console.log("   - token length:", sessionData.accessToken.length);
  console.log("   - expiresAtMs:", expiresAtMs);
  console.log("   - now:", now);
  console.log("   - expires in:", hoursUntilExpiry, "hours");
  
  try {
    await bridge.setSession(sessionData);
    console.log("✅ Session saved to native successfully");
  } catch (error) {
    console.error("❌ Failed to save session to native:", error);
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
