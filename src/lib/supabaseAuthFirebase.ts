import { supabase } from "@/integrations/supabase/client";
import { auth } from "./firebase";

export async function signInToSupabaseWithFirebaseToken(idToken: string) {
  const res = await supabase.auth.signInWithIdToken({
    provider: "firebase",
    token: idToken,
  } as any);
  if (res.error) throw res.error;
  return res.data;
}

export async function signOutFromBoth() {
  try { await auth.signOut(); } catch {}
  try { await supabase.auth.signOut(); } catch {}
}
