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

  // Helper function to save JWT with verification and retry
  const saveJWT = async (token: string) => {
    if (!token) {
      console.error('❌ Cannot save empty JWT token');
      return false;
    }

    // Check if we're on native platform
    const isNative = Capacitor.isNativePlatform();
    console.log('📱 Platform check:', isNative ? 'Native' : 'Web', 'AuthBridge:', !!AuthBridge);

    if (AuthBridge && isNative) {
      // Retry logic for JWT save
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          console.log(`💾 Saving JWT (attempt ${retryCount + 1}/${maxRetries})...`);
          console.log('🔑 Token preview:', token.substring(0, 50) + '...');
          
          await AuthBridge.saveToken({ token });
          console.log('✅ saveToken call completed');
          
          // Verify it was actually saved
          const verify = await AuthBridge.getToken();
          console.log('🔍 Verification result:', verify ? 'Token retrieved' : 'No token');
          
          if (verify?.token === token) {
            console.log('✅ JWT saved and verified in native storage!');
            return true;
          } else {
            console.warn(`⚠️ JWT verification failed on attempt ${retryCount + 1}`);
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (error) {
          console.error(`❌ Failed to save JWT (attempt ${retryCount + 1}):`, error);
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      console.error('❌ Failed to save JWT after all retries');
      return false;
    } else {
      console.log('ℹ️ Not on native platform or AuthBridge not available');
    }
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
          
          if (session) {
            console.log('✅ Session restored successfully');
            console.log('👤 User ID:', session.user?.id);
            
            // CRITICAL: Save JWT token immediately on app startup if session exists
            if (session.access_token) {
              console.log('🔐 Access token found, saving to native storage...');
              const saved = await saveJWT(session.access_token);
              if (saved) {
                console.log('✅ JWT persisted successfully - booking alerts will work');
              } else {
                console.error('❌ CRITICAL: JWT not persisted - booking alerts may fail');
              }
            } else {
              console.error('❌ Session has no access_token!');
            }
          } else {
            console.log('ℹ️ No session found');
          }
          
          setLoading(false);
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
        console.log('📊 Session status:', session ? 'Active' : 'None');
        
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          
          // Handle JWT token on auth state change
          if (session?.access_token) {
            console.log('🔐 Auth state has access_token, saving...');
            const saved = await saveJWT(session.access_token);
            if (saved) {
              console.log('✅ JWT saved on auth state change');
            } else {
              console.error('❌ Failed to save JWT on auth state change');
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
          
          setLoading(false);
        }
      }
    );

    // Aggressive JWT refresh - save token every 2 minutes if session exists
    const intervalId = setInterval(async () => {
      if (!mounted) return;
      
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token && Capacitor.isNativePlatform()) {
        const saved = await saveJWT(session.access_token);
        console.log('🔄 Periodic JWT refresh:', saved ? 'success' : 'failed');
      }
    }, 2 * 60 * 1000); // Every 2 minutes

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