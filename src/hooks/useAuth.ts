import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { capacitorStorage } from "@/lib/capacitorStorage";
import { auth as firebaseAuth } from "@/lib/firebase";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

// Simple user type for Firebase-only auth
interface AppUser {
  id: string;
  uid: string;
  phone: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Save Firebase user info to Capacitor storage (for native overlay access)
  const saveUserSession = async (fbUser: FirebaseUser | null) => {
    if (!Capacitor.isNativePlatform() || !fbUser) {
      return false;
    }

    try {
      console.log("💾 Saving Firebase user session to native storage...");
      const idToken = await fbUser.getIdToken();
      
      const sessionData = {
        uid: fbUser.uid,
        phone: fbUser.phoneNumber,
        idToken: idToken,
        savedAt: Date.now(),
      };

      await capacitorStorage.setItem("didi_session", JSON.stringify(sessionData));
      console.log("✅ Firebase session saved successfully");
      
      // Also save JWT for native components that need it
      if (AuthBridge) {
        await saveJWT(idToken);
      }
      
      return true;
    } catch (error) {
      console.error("❌ Failed to save Firebase session:", error);
      return false;
    }
  };

  // Helper function to save JWT with verification and retry logic
  const saveJWT = async (token: string) => {
    if (!AuthBridge || !Capacitor.isNativePlatform()) {
      console.log("⚠️ AuthBridge not available or not on native platform");
      return false;
    }

    // Retry up to 3 times with delays
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`💾 [Attempt ${attempt}/3] Saving Firebase ID token to native storage...`);
        console.log("🔑 Token preview:", token.substring(0, 50) + "...");

        await AuthBridge.saveToken({ token });

        // Wait a bit for the write to complete
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify it was actually saved
        const verify = await AuthBridge.getToken();
        if (verify?.token === token) {
          console.log(`✅ Token saved and verified successfully on attempt ${attempt}`);
          return true;
        } else {
          console.error(`❌ Token verification failed on attempt ${attempt} - token mismatch!`);
        }
      } catch (error) {
        console.error(`❌ Failed to save token on attempt ${attempt}:`, error);
      }

      // Wait before retry (except on last attempt)
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    console.error("❌ Failed to save token after 3 attempts");
    return false;
  };

  useEffect(() => {
    let mounted = true;

    console.log("🔐 Initializing Firebase-only auth...");

    // Listen to Firebase auth state changes
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      console.log("🔄 Firebase auth state changed:", fbUser ? `uid=${fbUser.uid}` : "signed out");

      if (!mounted) return;

      setFirebaseUser(fbUser);

      if (fbUser) {
        const appUser: AppUser = {
          id: fbUser.uid,
          uid: fbUser.uid,
          phone: fbUser.phoneNumber,
        };
        setUser(appUser);
        console.log("✅ User logged in:", appUser.uid, "phone:", appUser.phone);

        // Save session to native storage (async, don't block)
        if (Capacitor.isNativePlatform()) {
          setTimeout(() => {
            void saveUserSession(fbUser);
          }, 0);
        }
      } else {
        setUser(null);
        console.log("ℹ️ User signed out or no session");

        // Clear native storage on sign out
        if (Capacitor.isNativePlatform()) {
          setTimeout(async () => {
            try {
              await capacitorStorage.removeItem("didi_session");
              if (AuthBridge) {
                await AuthBridge.clearToken();
              }
              console.log("🗑️ Cleared session from native storage");
            } catch (err) {
              console.error("❌ Failed to clear native storage:", err);
            }
          }, 0);
        }
      }

      setLoading(false);
    });

    // Periodic token refresh for native storage (every 30 minutes)
    const intervalId = setInterval(async () => {
      if (!mounted) return;

      const currentUser = firebaseAuth.currentUser;
      if (currentUser && Capacitor.isNativePlatform()) {
        try {
          console.log("🔄 Periodic Firebase token refresh...");
          const idToken = await currentUser.getIdToken(true); // Force refresh
          await saveJWT(idToken);
          console.log("🔄 Periodic token refresh: ✅ success");
        } catch (err) {
          console.error("🔄 Periodic token refresh: ❌ failed", err);
        }
      }
    }, 30 * 60 * 1000); // Every 30 minutes

    return () => {
      mounted = false;
      unsubscribe();
      clearInterval(intervalId);
    };
  }, []);

  const signOut = async () => {
    try {
      await firebaseAuth.signOut();
      console.log("✅ Signed out from Firebase");
    } catch (err) {
      console.error("❌ Sign out error:", err);
    }
  };

  // Get current Firebase ID token for components that need it
  const getAccessToken = async (): Promise<string | null> => {
    if (!firebaseUser) return null;
    try {
      return await firebaseUser.getIdToken();
    } catch {
      return null;
    }
  };

  return { 
    user, 
    session: null, // No Supabase session - use firebaseUser instead
    loading, 
    signOut,
    firebaseUser,  // Expose raw Firebase user if needed
    getAccessToken, // For components that need access token
  };
}
