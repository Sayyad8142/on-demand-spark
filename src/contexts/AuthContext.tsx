import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { getStorageCacheDebug, reloadSessionFromStorage } from "@/lib/capacitorStorage";
import {
  clearNativeSession,
  safeRefreshSession,
  saveJWTToNative,
  saveSessionToNative,
  sessionNeedsRefresh,
  setIntentionalLogout,
  wasIntentionalLogout,
  tryRestoreSessionFromStorage,
} from "@/lib/sessionManager";

export type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<Session | null>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Track if we're currently attempting recovery from SIGNED_OUT
  const recoveringSignedOutRef = useRef(false);
  
  // Track consecutive SIGNED_OUT events to prevent infinite loops
  const signedOutCountRef = useRef(0);
  const lastSignedOutTimeRef = useRef(0);

  useEffect(() => {
    console.log("🔐 AuthProvider mounted, storage status:", getStorageCacheDebug());
  }, []);

  const refreshSession = useCallback(async (): Promise<Session | null> => {
    const refreshedSession = await safeRefreshSession();
    if (refreshedSession) {
      setSession(refreshedSession);
      setUser(refreshedSession.user);
    }
    return refreshedSession;
  }, []);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        console.log("🔐 Initializing auth...");

        // Get initial session with retry logic
        let retryCount = 0;
        let currentSession: Session | null = null;

        while (retryCount < 3 && !currentSession && mounted) {
          const { data, error } = await supabase.auth.getSession();
          if (error) {
            console.error("❌ Error getting session:", error);
            retryCount++;
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }
          currentSession = data.session;
          break;
        }

        // If no session in memory, try to restore from storage (native only)
        if (!currentSession && Capacitor.isNativePlatform()) {
          console.log("🔄 No session in memory, trying storage restore...");
          currentSession = await tryRestoreSessionFromStorage();
        }

        // If session exists but needs refresh, do it safely
        if (currentSession && sessionNeedsRefresh(currentSession)) {
          console.log("🔄 Session needs refresh on init...");
          currentSession = await safeRefreshSession();
        } else if (currentSession) {
          // Session is valid, just save to native storage
          await saveSessionToNative(currentSession);
          if (currentSession.access_token) {
            await saveJWTToNative(currentSession.access_token);
          }
        }

        if (mounted) {
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
          setLoading(false);

          if (currentSession) {
            console.log("✅ Session restored, user:", currentSession.user?.id);
          } else {
            console.log("ℹ️ No session found");
          }
        }
      } catch (error) {
        console.error("❌ Auth initialization error:", error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    const { data: subscriptionData } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log("🔄 Auth state changed:", event, "intentional:", wasIntentionalLogout());
      if (!mounted) return;

      // Handle SIGNED_OUT explicitly
      if (event === "SIGNED_OUT") {
        const now = Date.now();
        
        // Reset counter if more than 30 seconds since last SIGNED_OUT
        if (now - lastSignedOutTimeRef.current > 30000) {
          signedOutCountRef.current = 0;
        }
        
        signedOutCountRef.current++;
        lastSignedOutTimeRef.current = now;
        
        // If too many SIGNED_OUT events in short time, something is wrong.
        // Before giving up, try ONE last restore from persistent storage.
        if (signedOutCountRef.current > 3) {
          console.error("⚠️ Too many SIGNED_OUT events, attempting last restore...");

          if (Capacitor.isNativePlatform()) {
            try {
              await reloadSessionFromStorage();
              const recovered = await tryRestoreSessionFromStorage();
              if (recovered) {
                console.log("♻️ Recovered session after repeated SIGNED_OUT events");
                setSession(recovered);
                setUser(recovered.user);
                setLoading(false);

                await saveSessionToNative(recovered);
                if (recovered.access_token) {
                  await saveJWTToNative(recovered.access_token);
                }

                signedOutCountRef.current = 0;
                return;
              }
            } catch (e) {
              console.error("❌ Last restore attempt failed:", e);
            }
          }

          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }

        // If this was an intentional logout, clear everything
        if (wasIntentionalLogout()) {
          console.log("🚪 Intentional logout - clearing session");
          setSession(null);
          setUser(null);
          setLoading(false);
          
          if (Capacitor.isNativePlatform()) {
            await clearNativeSession();
          }
          
          // Reset the flag
          setIntentionalLogout(false);
          return;
        }

        // On native, we sometimes get a transient SIGNED_OUT due to refresh races.
        // Attempt recovery from persistent storage before giving up.
        if (Capacitor.isNativePlatform() && !recoveringSignedOutRef.current) {
          recoveringSignedOutRef.current = true;
          console.warn("⚠️ Unexpected SIGNED_OUT on native, attempting recovery...");

          try {
            // First, reload from persistent storage
            await reloadSessionFromStorage();
            
            // Try to get session again
            const { data } = await supabase.auth.getSession();
            let recovered = data.session;
            
            // If still no session, try to restore from raw storage
            if (!recovered) {
              recovered = await tryRestoreSessionFromStorage();
            }

            if (recovered) {
              console.log("♻️ Recovered session after SIGNED_OUT event");
              setSession(recovered);
              setUser(recovered.user);
              setLoading(false);

              await saveSessionToNative(recovered);
              if (recovered.access_token) {
                await saveJWTToNative(recovered.access_token);
              }
              
              // Reset counter on successful recovery
              signedOutCountRef.current = 0;
            } else {
              // No session to recover - user genuinely has no session
              console.log("ℹ️ No session to recover - user is logged out");
              setSession(null);
              setUser(null);
              setLoading(false);
              // DO NOT clear storage - might be needed later
            }
          } catch (e) {
            console.error("❌ SIGNED_OUT recovery failed:", e);
            // DO NOT clear session or storage on error
            // Just update UI state if we have no session in memory
            if (!session) {
              setSession(null);
              setUser(null);
              setLoading(false);
            }
          } finally {
            recoveringSignedOutRef.current = false;
          }

          return;
        }

        // Web platform or already recovering - just update state
        // But don't clear storage unless intentional
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }

      // For other events (SIGNED_IN, TOKEN_REFRESHED, etc.)
      if (event === "TOKEN_REFRESHED") {
        console.log("🔄 Token refreshed event received");
      }
      
      // Update state
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);

      // Save to native storage asynchronously
      if (newSession?.access_token && Capacitor.isNativePlatform()) {
        // Use setTimeout to not block the auth state change
        setTimeout(async () => {
          await saveSessionToNative(newSession);
          await saveJWTToNative(newSession.access_token);
        }, 0);
      }
    });

    // Manual refresh loop ONLY on native (web uses supabase-js auto refresh)
    const intervalId = Capacitor.isNativePlatform()
      ? setInterval(async () => {
          if (!mounted) return;

          try {
            const { data: current } = await supabase.auth.getSession();
            if (current.session && sessionNeedsRefresh(current.session)) {
              console.log("🔄 Scheduled token refresh...");
              await safeRefreshSession();
            }
          } catch (error) {
            console.error("❌ Scheduled refresh error:", error);
            // Don't do anything drastic on refresh error
          }
        }, 5 * 60 * 1000)
      : null;

    return () => {
      mounted = false;
      subscriptionData.subscription.unsubscribe();
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const signOut = useCallback(async () => {
    // Mark this as intentional logout BEFORE calling signOut
    setIntentionalLogout(true);
    console.log("🚪 User initiated logout");
    
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("❌ Error during signOut:", error);
      // Even if API call fails, clear local state
      setSession(null);
      setUser(null);
      if (Capacitor.isNativePlatform()) {
        await clearNativeSession();
      }
      setIntentionalLogout(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, session, loading, signOut, refreshSession }),
    [user, session, loading, signOut, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
