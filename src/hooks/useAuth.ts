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

  // Helper function to save JWT with verification and retry logic
  const saveJWT = async (token: string) => {
    if (!AuthBridge || !Capacitor.isNativePlatform()) {
      console.log('⚠️ AuthBridge not available or not on native platform');
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
          console.log('Expected:', token.substring(0, 50) + '...');
          console.log('Got:', verify?.token ? verify.token.substring(0, 50) + '...' : 'null');
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
  };

  useEffect(() => {
    let mounted = true;
    
    const initAuth = async () => {
      try {
        console.log('🔐 Initializing auth...');
        
        // Get initial session with retry logic
        let retryCount = 0;
        let session = null;
        
        while (retryCount < 3 && !session && mounted) {
          const { data, error } = await supabase.auth.getSession();
          if (error) {
            console.error('❌ Error getting session:', error);
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
          session = data.session;
          break;
        }
        
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
          
          if (session) {
            console.log('✅ Session restored successfully');
            console.log('👤 User ID:', session.user?.id);
            // Save JWT token immediately on app startup if session exists
            if (session.access_token) {
              console.log('🔐 Saving access token on app startup...');
              const saved = await saveJWT(session.access_token);
              if (saved) {
                console.log('✅ JWT successfully saved on startup');
              } else {
                console.error('❌ Failed to save JWT on startup - booking acceptance may not work!');
              }
            } else {
              console.error('❌ No access token in session!');
            }
          } else {
            console.log('ℹ️ No session found');
          }
        }
      } catch (error) {
        console.error('❌ Auth initialization error:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔄 Auth state changed:', event);
        
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
          
          // Save or clear JWT token
          if (session?.access_token) {
            console.log('🔐 Auth state changed - saving new JWT token...');
            const saved = await saveJWT(session.access_token);
            if (saved) {
              console.log('✅ JWT successfully saved after auth state change');
            } else {
              console.error('❌ Failed to save JWT after auth state change');
            }
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
      }
    );

    // Aggressive JWT refresh - save token every 1 minute if session exists
    const intervalId = setInterval(async () => {
      if (!mounted) return;
      
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token && Capacitor.isNativePlatform()) {
        console.log('🔄 Periodic JWT refresh starting...');
        const saved = await saveJWT(session.access_token);
        console.log('🔄 Periodic JWT refresh:', saved ? '✅ success' : '❌ failed');
      }
    }, 1 * 60 * 1000); // Every 1 minute

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearInterval(intervalId);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, session, loading, signOut };
}