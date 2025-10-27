import { Capacitor } from "@capacitor/core";
import { Session } from "@supabase/supabase-js";

type SessionData = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch milliseconds
  userId: string;
};

function getAuthBridge() {
  if (!Capacitor.isNativePlatform()) return null;
  // @ts-ignore - Capacitor plugin
  return (window as any)?.Capacitor?.Plugins?.AuthBridge;
}

export async function saveSessionToNative(session: Session | null) {
  const bridge = getAuthBridge();
  if (!bridge) return;

  if (!session?.access_token) {
    console.log("🔐 No session to save, clearing native session");
    await bridge.clearSession();
    return;
  }

  // Convert Supabase seconds → milliseconds
  const expiresAtSec = session.expires_at ?? Math.floor(Date.now() / 1000) + 3600;
  const expiresAtMs = expiresAtSec * 1000;  // ✅ Convert to milliseconds

  const sessionData: SessionData = {
    accessToken: session.access_token,
    refreshToken: session.refresh_token ?? "",
    expiresAt: expiresAtMs,  // ✅ Store milliseconds
    userId: session.user?.id ?? "",
  };

  console.log("🔐 Saving session to native bridge - userId:", sessionData.userId, "expiresAtMs:", expiresAtMs);
  await bridge.setSession(sessionData);
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
