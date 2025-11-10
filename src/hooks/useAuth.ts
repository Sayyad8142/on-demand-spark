import { useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from '@capacitor/core';
import { capacitorStorage } from '@/lib/capacitorStorage';
import { saveJWTToken, clearJWTToken } from '@/native/authBridge';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Save full session to Capacitor storage (for native overlay access)
  const saveSession = async (session: Session | null) => {
    if (!Capacitor.isNativePlatform() || !session) {
      return false;
    }

    try {
      console.log('💾 Saving session to native storage...');
      
      const sessionData = {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at
      };
      
      await capacitorStorage.setItem('didi_session', JSON.stringify(sessionData));
      console.log('✅ Session saved successfully to didi_session key');
      return true;
    } catch (error) {
      console.error('❌ Failed to save session:', error);
      return false;
    }
  };

  // Helper function to save JWT (uses native bridge module)
  const saveJWT = async (token: string) => {
    return await saveJWTToken(token);
  };

  useEffect(() => {
    let mounted = true;
    
    const initAuth = async () => {
      try {
        console.log('🔐 Initializing auth...');
        
        // Set a maximum timeout to prevent infinite loading
        const timeoutId = setTimeout(() => {
          if (mounted && loading) {
            console.warn('⚠️ Auth initialization timeout - setting loading to false');
            setLoading(false);
          }
        }, 5000); // 5 second timeout
        
        // Get initial session with retry logic
        let retryCount = 0;
        let session = null;
        
        while (retryCount < 2 && !session && mounted) {
          const { data, error } = await supabase.auth.getSession();
          if (error) {
            console.error('❌ Error getting session:', error);
            retryCount++;
            if (retryCount < 2) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
            continue;
          }
          session = data.session;
          break;
        }
        
        clearTimeout(timeoutId);
        
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
          
          if (session) {
            console.log('✅ Session restored successfully');
            console.log('👤 User ID:', session.user?.id);
            
            // Save full session for native overlay
            await saveSession(session);
            
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
          
          // Save or clear session and JWT token
          if (session?.access_token) {
            console.log('🔐 Auth state changed - saving session and JWT...');
            
            // Save full session for native overlay
            await saveSession(session);
            
            // Save JWT for AuthBridge
            const saved = await saveJWT(session.access_token);
            if (saved) {
              console.log('✅ Session and JWT successfully saved after auth state change');
            } else {
              console.error('❌ Failed to save JWT after auth state change');
            }
          } else if (Capacitor.isNativePlatform()) {
            // Clear tokens on logout
            try {
              await capacitorStorage.removeItem('didi_session');
              await clearJWTToken();
              console.log('🗑️ Cleared session from native storage');
            } catch (error) {
              console.error('❌ Failed to clear session:', error);
            }
          }
        }
      }
    );

    // Aggressive session refresh - save session every 1 minute if exists
    const intervalId = setInterval(async () => {
      if (!mounted) return;
      
      const { data: { session } } = await supabase.auth.getSession();
      if (session && Capacitor.isNativePlatform()) {
        console.log('🔄 Periodic session refresh starting...');
        await saveSession(session);
        if (session.access_token) {
          const saved = await saveJWT(session.access_token);
          console.log('🔄 Periodic refresh:', saved ? '✅ success' : '❌ failed');
        }
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