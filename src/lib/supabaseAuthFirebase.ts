import { supabase } from "@/integrations/supabase/client";
import { auth } from "./firebase";

export async function signInToSupabaseWithFirebaseToken(idToken: string) {
  // Use Firebase provider ONLY (do not fallback to oidc)
  let res = await supabase.auth.signInWithIdToken({
    provider: "firebase",
    token: idToken,
  } as any);

  // Some Supabase setups use a different key for Firebase
  if (res.error?.message?.toLowerCase().includes("not allowed") ||
      res.error?.message?.toLowerCase().includes("provider")) {
    res = await supabase.auth.signInWithIdToken({
      provider: "firebase-phone",
      token: idToken,
    } as any);
  }

  if (res.error) throw res.error;
  return res.data;
}

export async function signOutFromBoth() {
  try { await auth.signOut(); } catch {}
  try { await supabase.auth.signOut(); } catch {}
}
