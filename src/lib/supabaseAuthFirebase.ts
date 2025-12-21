import { auth } from "./firebase";

/**
 * DEPRECATED: Firebase is now the sole auth provider.
 * This function is a no-op that returns a success response.
 * Supabase Third-Party Auth is no longer used.
 */
export async function signInToSupabaseWithFirebaseToken(_idToken: string) {
  console.log('🔐 [Auth] Firebase-only mode - skipping Supabase signInWithIdToken');
  // Return a mock success response for compatibility
  return { 
    user: auth.currentUser ? { id: auth.currentUser.uid } : null,
    session: null 
  };
}

export async function signOutFromBoth() {
  try { 
    await auth.signOut(); 
    console.log('✅ Signed out from Firebase');
  } catch (err) {
    console.error('❌ Firebase sign out error:', err);
  }
}
