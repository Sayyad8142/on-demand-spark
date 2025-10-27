import { useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { saveSessionToNative, clearSessionFromNative } from "@/lib/authBridge";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync session to native platform for overlay access
  const syncSessionToNative = async (session: Session | null) => {
    try {
      await saveSessionToNative(session);
    } catch (error) {
      console.error("❌ Failed to sync session to native:", error);
    }
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
            // Sync session to native for overlay access
            await syncSessionToNative(session);
          } else {
            console.log('ℹ️ No session found');
            await clearSessionFromNative();
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
          
          // Sync session to native
          await syncSessionToNative(session);
        }
      }
    );

    // Periodic session sync - every 5 minutes to ensure native has fresh token
    const intervalId = setInterval(async () => {
      if (!mounted) return;
      
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        console.log('🔄 Periodic session sync to native...');
        await syncSessionToNative(session);
      }
    }, 5 * 60 * 1000); // Every 5 minutes

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