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

  // Helper function to save JWT with verification
  const saveJWT = async (token: string) => {
    if (AuthBridge && Capacitor.isNativePlatform()) {
      try {
        console.log('💾 Saving JWT...', token.substring(0, 30) + '...');
        await AuthBridge.saveToken({ token });
        
        // Verify it was actually saved
        const verify = await AuthBridge.getToken();
        if (verify?.token === token) {
          console.log('✅ JWT saved and verified in native storage');
          return true;
        } else {
          console.error('❌ JWT save verification failed - token mismatch!');
          return false;
        }
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

    // Aggressive JWT refresh - save token every 2 minutes if session exists
    const intervalId = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token && Capacitor.isNativePlatform()) {
        const saved = await saveJWT(session.access_token);
        console.log('🔄 Periodic JWT refresh:', saved ? 'success' : 'failed');
      }
    }, 2 * 60 * 1000); // Every 2 minutes

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