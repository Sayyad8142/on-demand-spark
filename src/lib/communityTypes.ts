import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight registry of community types (apartment | villa).
 *
 * Villa detection must be available *synchronously* while rendering the
 * incoming booking popup, so the map is cached in memory + localStorage and
 * refreshed in the background. No render path ever awaits a DB call.
 */

export type CommunityType = "apartment" | "villa";

const STORAGE_KEY = "dn_community_types_v1";

let cache: Record<string, CommunityType> = {};
let loading: Promise<void> | null = null;

const norm = (v: string | null | undefined) =>
  (v || "").toString().trim().toLowerCase().replace(/[\s_]+/g, "-");

// Hydrate synchronously from localStorage so the first popup is already correct.
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) cache = JSON.parse(raw) || {};
} catch {
  cache = {};
}

export async function loadCommunityTypes(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = (async () => {
    try {
      const { data, error } = await supabase.rpc("get_community_types");
      if (error || !Array.isArray(data)) return;
      const next: Record<string, CommunityType> = {};
      for (const row of data as any[]) {
        const type: CommunityType = row.community_type === "villa" ? "villa" : "apartment";
        if (row.value) next[norm(row.value)] = type;
        if (row.name) next[norm(row.name)] = type;
        if (row.id) next[norm(row.id)] = type;
      }
      cache = next;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn("[CommunityTypes] load failed", e);
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/**
 * Synchronous villa check for a community slug / name / id.
 * Falls back to a name heuristic when the registry has no entry yet
 * (e.g. very first launch before the cache warms up).
 */
export function isVillaCommunity(community: string | null | undefined): boolean {
  const key = norm(community);
  if (!key) return false;
  const known = cache[key];
  if (known) return known === "villa";
  return /villa/.test(key);
}

export function getCommunityType(community: string | null | undefined): CommunityType {
  return isVillaCommunity(community) ? "villa" : "apartment";
}
