import { supabase } from "@/integrations/supabase/client";

/**
 * Shared utility to resolve a worker's primary UUID from a Supabase Auth UID.
 * Handles the dual-resolution pattern: user_id = uid OR id = uid.
 */
export async function getWorkerId(authUid: string | undefined): Promise<string | null> {
  if (!authUid) return null;

  try {
    const { data, error } = await supabase
      .from("workers")
      .select("id")
      .or(`user_id.eq.${authUid},id.eq.${authUid}`)
      .maybeSingle();

    if (error || !data) {
      console.warn("[WorkerId] Lookup failed for UID:", authUid, error?.message);
      return null;
    }

    return data.id;
  } catch (err) {
    console.error("[WorkerId] Resolution exception:", err);
    return null;
  }
}
