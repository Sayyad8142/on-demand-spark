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

  const recoveringSignedOutRef = useRef(false);

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

    const { data: subscriptionData } = supabase.auth.onAuthStateChange((event, newSession) => {
      console.log("🔄 Auth state changed:", event);
      if (!mounted) return;

      // Handle SIGNED_OUT explicitly
      if (event === "SIGNED_OUT") {
        // On native, we sometimes get a transient SIGNED_OUT due to refresh races.
        // Attempt a one-time recovery from persistent storage before clearing.
        if (Capacitor.isNativePlatform() && !recoveringSignedOutRef.current) {
          recoveringSignedOutRef.current = true;
          setLoading(true);

          setTimeout(async () => {
            try {
              await reloadSessionFromStorage();
              const { data } = await supabase.auth.getSession();
              const recovered = data.session;

              if (recovered) {
                console.warn("♻️ Recovered session after SIGNED_OUT event");
                setSession(recovered);
                setUser(recovered.user);
                setLoading(false);

                await saveSessionToNative(recovered);
                if (recovered.access_token) {
                  await saveJWTToNative(recovered.access_token);
                }
              } else {
                setSession(null);
                setUser(null);
                setLoading(false);
                await clearNativeSession();
              }
            } catch (e) {
              console.error("❌ SIGNED_OUT recovery failed:", e);
              setSession(null);
              setUser(null);
              setLoading(false);
              await clearNativeSession();
            } finally {
              recoveringSignedOutRef.current = false;
            }
          }, 0);

          return;
        }

        setSession(null);
        setUser(null);
        setLoading(false);

        if (Capacitor.isNativePlatform()) {
          setTimeout(() => clearNativeSession(), 0);
        }
        return;
      }

      // Update state
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);

      // Save to native storage asynchronously
      if (newSession?.access_token && Capacitor.isNativePlatform()) {
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

          const { data: current } = await supabase.auth.getSession();
          if (current.session && sessionNeedsRefresh(current.session)) {
            console.log("🔄 Scheduled token refresh...");
            await safeRefreshSession();
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
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, session, loading, signOut, refreshSession }),
    [user, session, loading, signOut, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
