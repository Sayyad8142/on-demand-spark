import { supabase } from "@/integrations/supabase/client";
import { auth } from "./firebase";

const SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co";

export async function signInToSupabaseWithFirebaseToken(idToken: string) {
  console.log('🔐 [Supabase Auth] Starting signInWithIdToken...');
  console.log('🔐 [Supabase Auth] Using Supabase URL:', SUPABASE_URL);
  console.log('🔐 [Supabase Auth] Token preview:', idToken.substring(0, 50) + '...');
  
  try {
    const res = await supabase.auth.signInWithIdToken({
      provider: "firebase",
      token: idToken,
    } as any);
    
    if (res.error) {
      console.error('❌ [Supabase Auth] signInWithIdToken failed:', res.error.message);
      console.error('❌ [Supabase Auth] Error details:', JSON.stringify(res.error, null, 2));
      throw res.error;
    }
    
    console.log('✅ [Supabase Auth] Successfully signed in, user:', res.data.user?.id);
    return res.data;
  } catch (err: any) {
    console.error('❌ [Supabase Auth] Exception during signInWithIdToken:', err?.message || err);
    throw err;
  }
}

export async function signOutFromBoth() {
  try { await auth.signOut(); } catch {}
  try { await supabase.auth.signOut(); } catch {}
}
