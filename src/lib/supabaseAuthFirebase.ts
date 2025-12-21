import { supabase } from "@/integrations/supabase/client";
import { auth } from "./firebase";

const SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co";

export async function signInToSupabaseWithFirebaseToken(idToken: string) {
  console.log('🔐 [Supabase Auth] Starting signInWithIdToken...');
  console.log('🔐 [Supabase Auth] Using Supabase URL:', SUPABASE_URL);
  
  // Decode token to check claims (for debugging)
  try {
    const payload = JSON.parse(atob(idToken.split('.')[1]));
    console.log('🔐 [Token Claims] role:', payload.role, '| aud:', payload.aud);
    
    if (!payload.role || payload.role !== 'authenticated') {
      console.warn('⚠️ [Token] Missing required claim: role="authenticated"');
      console.warn('⚠️ [Token] User needs to sign out and sign in again after Firebase claims are set');
    }
  } catch (e) {
    console.log('🔐 [Token] Could not decode token for debugging');
  }
  
  try {
    const res = await supabase.auth.signInWithIdToken({
      provider: "firebase",
      token: idToken,
    } as any);
    
    if (res.error) {
      console.error('❌ [Supabase Auth] signInWithIdToken failed:', res.error.message);
      console.error('❌ [Supabase Auth] Full error:', JSON.stringify(res.error, null, 2));
      
      // Provide helpful error context
      if (res.error.message?.includes('custom oidc provider') || res.error.message?.includes('not allowed')) {
        console.error('❌ [Supabase Auth] This error means:');
        console.error('   1. Firebase Third-Party Auth may not be enabled in Supabase Dashboard');
        console.error('   2. OR the Firebase token is missing required claims (role: "authenticated")');
        console.error('   3. Deploy Firebase Cloud Function to set claims, then user must re-login');
      }
      
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
