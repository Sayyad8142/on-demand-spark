import { supabase } from "@/integrations/supabase/client";

/**
 * Shared utility to resolve a worker's primary UUID from a Supabase Auth UID.
 * Handles the dual-resolution pattern: user_id = uid OR id = uid.
 * Uses a small in-memory cache to reduce redundant lookups in the same lifecycle.
 */
let cachedMap: Record<string, string> = {};

export async function getWorkerId(authUid: string | undefined): Promise<string | null> {
  if (!authUid) return null;
  if (cachedMap[authUid]) return cachedMap[authUid];

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

    cachedMap[authUid] = data.id;
    return data.id;
  } catch (err) {
    console.error("[WorkerId] Resolution exception:", err);
    return null;
  }
}

/** Clears the local cache - useful on logout. */
export function clearWorkerIdCache() {
  cachedMap = {};
}
