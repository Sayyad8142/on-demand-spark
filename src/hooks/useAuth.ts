import { useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from '@capacitor/core';

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Helper function to save JWT
  const saveJWT = async (token: string) => {
    if (AuthBridge && Capacitor.isNativePlatform()) {
      try {
        await AuthBridge.saveToken({ token });
        console.log('✅ JWT saved to native bridge');
        return true;
      } catch (error) {
        console.error('❌ Failed to save JWT:', error);
        return false;
      }
    }
    return false;
  };

  useEffect(() => {
    // Get initial session first
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      // CRITICAL: Save JWT token immediately on app startup if session exists
      if (session?.access_token) {
        await saveJWT(session.access_token);
      }
    });

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        // Save or clear JWT token
        if (session?.access_token) {
          await saveJWT(session.access_token);
        } else if (AuthBridge && Capacitor.isNativePlatform()) {
          // Clear token on logout
          try {
            await AuthBridge.clearToken();
            console.log('🗑️ Cleared JWT from native bridge');
          } catch (error) {
            console.error('❌ Failed to clear JWT:', error);
          }
        }
      }
    );

    // Periodic JWT refresh - save token every 5 minutes if session exists
    const intervalId = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token && Capacitor.isNativePlatform()) {
        await saveJWT(session.access_token);
        console.log('🔄 Periodic JWT refresh completed');
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => {
      subscription.unsubscribe();
      clearInterval(intervalId);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, session, loading, signOut };
}