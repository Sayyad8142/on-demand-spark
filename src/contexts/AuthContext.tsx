import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { getStorageCacheDebug, reloadSessionFromStorage, storageReadyPromise } from "@/lib/capacitorStorage";
import {
  clearNativeSession,
  persistSessionAtomic,
  setIntentionalLogout,
  wasIntentionalLogout,
  tryRestoreSessionFromStorage,
} from "@/lib/sessionManager";
import { authLog } from "@/lib/authLogger";

export type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** True ONLY after initAuth finishes and session has been loaded/restored (or confirmed null) */
  authReady: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<Session | null>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  // Track if we're currently attempting recovery from SIGNED_OUT
  const recoveringSignedOutRef = useRef(false);
  
  // Track consecutive SIGNED_OUT events to prevent infinite loops
  const signedOutCountRef = useRef(0);
  const lastSignedOutTimeRef = useRef(0);
  
  // Track if initAuth has completed
  const initCompletedRef = useRef(false);

  useEffect(() => {
    console.log("🔐 AuthProvider mounted, storage status:", getStorageCacheDebug());
  }, []);

  // Simple refresh that just gets the current session - supabase-js handles actual refresh
  const refreshSession = useCallback(async (): Promise<Session | null> => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("❌ Error getting session:", error);
        return null;
      }
      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
      }
      return data.session;
    } catch (error) {
      console.error("❌ refreshSession error:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        authLog.initAuthStart();
        
        // CRITICAL: Wait for storage to be ready before proceeding
        if (Capacitor.isNativePlatform()) {
          console.log("⏳ Waiting for storage ready...");
          await storageReadyPromise;
          console.log("✅ Storage ready, proceeding with auth init");
        }

        // Get initial session - supabase-js will auto-refresh if needed
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
        
        authLog.initAuthSession(!!currentSession, currentSession?.user?.id);

        // If no session in memory on native, try to restore from storage
        if (!currentSession && Capacitor.isNativePlatform()) {
          console.log("🔄 No session in memory, trying restore from storage...");
          
          await reloadSessionFromStorage();
          
          const { data: retryData } = await supabase.auth.getSession();
          currentSession = retryData.session;
          
          if (!currentSession) {
            authLog.restoreAttempt('full restore sequence');
            currentSession = await tryRestoreSessionFromStorage();
            authLog.restoreResult('full restore sequence', !!currentSession, currentSession?.user?.id);
          }
        }

        // Persist session if we have one (ensures native storage is in sync)
        if (currentSession) {
          await persistSessionAtomic(currentSession);
        }

        if (mounted) {
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
          setLoading(false);
          initCompletedRef.current = true;
          setAuthReady(true);
          console.log("✅ AuthProvider: authReady=true (initAuth completed)", { hasSession: !!currentSession });

          if (currentSession) {
            authLog.routeDecision('/home', `session restored for ${currentSession.user?.id}`);
          } else {
            authLog.routeDecision('/auth', 'no session after full restore sequence');
          }
        }
      } catch (error) {
        console.error("❌ Auth initialization error:", error);
        if (mounted) {
          setLoading(false);
          initCompletedRef.current = true;
          setAuthReady(true);
          console.log("✅ AuthProvider: authReady=true (initAuth error fallback)");
        }
      }
    };

    initAuth();

    const { data: subscriptionData } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      console.log("🔄 Auth state changed:", event, "intentional:", wasIntentionalLogout());
      if (!mounted) return;

      // Handle TOKEN_REFRESHED - just persist, supabase-js handles the refresh
      if (event === "TOKEN_REFRESHED") {
        console.log("🔄 Token refreshed by supabase-js");
        if (newSession?.access_token && Capacitor.isNativePlatform()) {
          await persistSessionAtomic(newSession);
        }
        setSession(newSession);
        setUser(newSession?.user ?? null);
        return;
      }

      // Handle SIGNED_IN - persist session
      if (event === "SIGNED_IN") {
        console.log("✅ User signed in");
        if (newSession?.access_token && Capacitor.isNativePlatform()) {
          await persistSessionAtomic(newSession);
        }
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
        return;
      }

      // Handle SIGNED_OUT explicitly
      if (event === "SIGNED_OUT") {
        const now = Date.now();
        
        // Reset counter if more than 60 seconds since last SIGNED_OUT
        if (now - lastSignedOutTimeRef.current > 60000) {
          signedOutCountRef.current = 0;
        }
        
        signedOutCountRef.current++;
        lastSignedOutTimeRef.current = now;
        
        authLog.signedOutEvent(wasIntentionalLogout(), signedOutCountRef.current);
        
        // If intentional logout, clear everything
        if (wasIntentionalLogout()) {
          console.log("🚪 Intentional logout - clearing session");
          setSession(null);
          setUser(null);
          setLoading(false);
          
          if (Capacitor.isNativePlatform()) {
            await clearNativeSession();
          }
          
          setIntentionalLogout(false);
          signedOutCountRef.current = 0;
          return;
        }

        // Too many SIGNED_OUT events - increase tolerance before giving up
        if (signedOutCountRef.current > 10) {
          console.error("⚠️ Too many SIGNED_OUT events (>10), final recovery attempt...");
          
          if (Capacitor.isNativePlatform()) {
            try {
              // Wait a bit to let any ongoing token rotation complete
              await new Promise(resolve => setTimeout(resolve, 2000));
              await reloadSessionFromStorage();
              const recovered = await tryRestoreSessionFromStorage();
              if (recovered) {
                console.log("♻️ Recovered session after repeated SIGNED_OUT");
                setSession(recovered);
                setUser(recovered.user);
                setLoading(false);
                await persistSessionAtomic(recovered);
                signedOutCountRef.current = 0;
                return;
              }
            } catch (e) {
              console.error("❌ Final recovery failed:", e);
            }
          }

          // Truly no session
          setSession(null);
          setUser(null);
          setLoading(false);
          return;
        }

        // On native, attempt recovery from storage (transient SIGNED_OUT can happen)
        if (Capacitor.isNativePlatform() && !recoveringSignedOutRef.current) {
          recoveringSignedOutRef.current = true;
          console.warn("⚠️ Unexpected SIGNED_OUT on native, attempting recovery...");

          try {
            await reloadSessionFromStorage();
            
            const { data } = await supabase.auth.getSession();
            let recovered = data.session;
            
            if (!recovered) {
              recovered = await tryRestoreSessionFromStorage();
            }

            if (recovered) {
              console.log("♻️ Recovered session after SIGNED_OUT");
              setSession(recovered);
              setUser(recovered.user);
              setLoading(false);
              await persistSessionAtomic(recovered);
              signedOutCountRef.current = 0;
            } else {
              console.log("ℹ️ No session to recover - user is logged out");
              setSession(null);
              setUser(null);
              setLoading(false);
            }
          } catch (e) {
            console.error("❌ SIGNED_OUT recovery failed:", e);
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

        // Web platform or already recovering
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }

      // For other events, just update state
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    // NO manual refresh interval - supabase-js autoRefreshToken handles it

    return () => {
      mounted = false;
      subscriptionData.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    setIntentionalLogout(true);
    console.log("🚪 User initiated logout");
    
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("❌ Error during signOut:", error);
      setSession(null);
      setUser(null);
      if (Capacitor.isNativePlatform()) {
        await clearNativeSession();
      }
      setIntentionalLogout(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, session, loading, authReady, signOut, refreshSession }),
    [user, session, loading, authReady, signOut, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}