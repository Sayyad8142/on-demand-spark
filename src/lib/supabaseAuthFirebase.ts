import { supabase } from "@/integrations/supabase/client";
import { auth } from "./firebase";

export async function signInToSupabaseWithFirebaseToken(idToken: string) {
  // Try Firebase provider first (Supabase third-party auth naming can differ)
  let res = await supabase.auth.signInWithIdToken({
    provider: "firebase",
    token: idToken,
  } as any);

  // If provider not allowed, try alternate provider keys
  if (res.error?.message?.includes("not allowed") || res.error?.message?.includes("provider")) {
    console.log("Firebase provider not allowed, trying firebase-phone...");
    res = await supabase.auth.signInWithIdToken({
      provider: "firebase-phone",
      token: idToken,
    } as any);
  }

  // Try generic oidc as last fallback
  if (res.error?.message?.includes("not allowed") || res.error?.message?.includes("provider")) {
    console.log("firebase-phone not allowed, trying oidc...");
    res = await supabase.auth.signInWithIdToken({
      provider: "oidc",
      token: idToken,
    } as any);
  }

  // If still failing, throw with helpful message
  if (res.error) {
    console.error("Supabase signInWithIdToken failed:", res.error);
    throw new Error(
      `Supabase auth failed: ${res.error.message}. Please configure Firebase as a third-party auth provider in Supabase Dashboard > Authentication > Providers.`
    );
  }

  return { user: res.data.user, session: res.data.session };
}

export async function signOutFromBoth() {
  try { await auth.signOut(); } catch {}
  try { await supabase.auth.signOut(); } catch {}
}
