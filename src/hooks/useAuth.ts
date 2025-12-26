import { useEffect, useState } from "react";
import { Capacitor } from '@capacitor/core';
import { capacitorStorage } from '@/lib/capacitorStorage';
import { auth, signOutFirebase, getFirebaseIdToken } from '@/lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;
// @ts-ignore - Native Firebase Auth
const FirebasePhoneAuth = (window as any).Capacitor?.Plugins?.FirebasePhoneAuth;

export interface AuthUser {
  id: string;
  phone: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [idToken, setIdToken] = useState<string | null>(null);

  // Save JWT to native storage for overlay functionality
  const saveJWT = async (token: string) => {
    if (!AuthBridge || !Capacitor.isNativePlatform()) {
      return false;
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`💾 [Attempt ${attempt}/3] Saving JWT to native storage...`);
        await AuthBridge.saveToken({ token });
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const verify = await AuthBridge.getToken();
        if (verify?.token === token) {
          console.log(`✅ JWT saved and verified on attempt ${attempt}`);
          return true;
        }
      } catch (error) {
        console.error(`❌ Failed to save JWT on attempt ${attempt}:`, error);
      }
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    return false;
  };

  // Save session data to capacitor storage
  const saveSession = async (uid: string, phone: string | null, token: string) => {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
      const sessionData = {
        uid,
        phone,
        idToken: token,
        savedAt: Date.now()
      };
      await capacitorStorage.setItem('firebase_session', JSON.stringify(sessionData));
      console.log('✅ Firebase session saved to storage');
    } catch (error) {
      console.error('❌ Failed to save session:', error);
    }
  };

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      console.log('🔐 Initializing Firebase auth...');
      
      // Check for native user first (Android)
      if (Capacitor.isNativePlatform() && FirebasePhoneAuth) {
        try {
          const result = await FirebasePhoneAuth.getCurrentUser();
          if (result?.uid) {
            console.log('✅ Found native Firebase user:', result.uid);
            if (mounted) {
              setUser({ id: result.uid, phone: result.phone || null });
              setIdToken(result.idToken || null);
              
              if (result.idToken) {
                await saveJWT(result.idToken);
                await saveSession(result.uid, result.phone, result.idToken);
              }
            }
          }
        } catch (error) {
          console.log('ℹ️ No native user found:', error);
        }
      }

      // Set up web Firebase auth listener
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
        console.log('🔄 Firebase auth state changed:', firebaseUser?.uid || 'null');
        
        if (!mounted) return;

        if (firebaseUser) {
          const token = await getFirebaseIdToken();
          
          setUser({
            id: firebaseUser.uid,
            phone: firebaseUser.phoneNumber || null
          });
          setIdToken(token);
          
          if (token && Capacitor.isNativePlatform()) {
            await saveJWT(token);
            await saveSession(firebaseUser.uid, firebaseUser.phoneNumber, token);
          }
        } else {
          setUser(null);
          setIdToken(null);
          
          // Clear native storage on logout
          if (Capacitor.isNativePlatform()) {
            try {
              await capacitorStorage.removeItem('firebase_session');
              if (AuthBridge) {
                await AuthBridge.clearToken();
              }
              console.log('🗑️ Cleared session from native storage');
            } catch (error) {
              console.error('❌ Failed to clear session:', error);
            }
          }
        }
        
        setLoading(false);
      });

      // Timeout for loading state
      setTimeout(() => {
        if (mounted && loading) {
          console.log('⏰ Auth init timeout');
          setLoading(false);
        }
      }, 5000);

      return unsubscribe;
    };

    const cleanup = initAuth();
    
    return () => {
      mounted = false;
      cleanup.then(unsub => unsub?.());
    };
  }, []);

  // Periodic token refresh
  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return;

    const intervalId = setInterval(async () => {
      const token = await getFirebaseIdToken();
      if (token) {
        setIdToken(token);
        await saveJWT(token);
        console.log('🔄 Periodic token refresh completed');
      }
    }, 60 * 1000); // Every minute

    return () => clearInterval(intervalId);
  }, [user]);

  const signOut = async () => {
    try {
      // Sign out from native Firebase
      if (Capacitor.isNativePlatform() && FirebasePhoneAuth) {
        await FirebasePhoneAuth.signOut();
      }
      // Sign out from web Firebase
      await signOutFirebase();
      
      // Clear local storage
      localStorage.removeItem('demo_mode');
      localStorage.removeItem('guest_mode');
    } catch (error) {
      console.error('❌ Sign out error:', error);
    }
  };

  return { user, loading, signOut, idToken };
}
