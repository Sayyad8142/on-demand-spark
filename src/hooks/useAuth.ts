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

  useEffect(() => {
    // Get initial session first
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      // CRITICAL: Save JWT token immediately on app startup if session exists
      if (session?.access_token && AuthBridge && Capacitor.isNativePlatform()) {
        try {
          await AuthBridge.saveToken({ token: session.access_token });
          console.log('✅ Initial JWT saved to native bridge on startup');
        } catch (error) {
          console.error('❌ Failed to save initial JWT:', error);
        }
      }
    });

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        // Save JWT token for native overlay service
        if (session?.access_token && AuthBridge && Capacitor.isNativePlatform()) {
          try {
            await AuthBridge.saveToken({ token: session.access_token });
            console.log('✅ JWT saved to native bridge (auth state change)');
          } catch (error) {
            console.error('❌ Failed to save JWT:', error);
          }
        } else if (!session && AuthBridge && Capacitor.isNativePlatform()) {
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

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, session, loading, signOut };
}