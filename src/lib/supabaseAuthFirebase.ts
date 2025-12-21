import { supabase } from "@/integrations/supabase/client";
import { auth } from "./firebase";

export async function signInToSupabaseWithFirebaseToken(idToken: string) {
  console.log('🔐 [Supabase Auth] Signing in with Firebase ID token...');
  
  // Use signInWithIdToken with provider "firebase" for Third-Party Auth
  // This requires Firebase to be configured in Supabase Dashboard > Auth > Third-party Auth
  const res = await supabase.auth.signInWithIdToken({
    provider: "firebase",
    token: idToken,
  } as any);
  
  if (res.error) {
    console.error('❌ [Supabase Auth] signInWithIdToken failed:', res.error);
    throw res.error;
  }
  
  console.log('✅ [Supabase Auth] Successfully signed in, user:', res.data.user?.id);
  return res.data;
}

export async function signOutFromBoth() {
  try { await auth.signOut(); } catch {}
  try { await supabase.auth.signOut(); } catch {}
}
