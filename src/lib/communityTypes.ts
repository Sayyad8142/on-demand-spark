import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight registry of community types (apartment | villa).
 *
 * Villa detection must be available *synchronously* while rendering the
 * incoming booking popup, so the map is cached in memory + localStorage and
 * refreshed in the background. No render path ever awaits a DB call.
 */

export type CommunityType = "apartment" | "villa";
/** `standard` = tower encoded inside flat_no (PHF). Anything else = separate block/building. */
export type FlatFormat = string;

const STORAGE_KEY = "dn_community_types_v1";
const FORMAT_STORAGE_KEY = "dn_community_formats_v1";

let cache: Record<string, CommunityType> = {};
let formatCache: Record<string, FlatFormat> = {};
let loading: Promise<void> | null = null;

const norm = (v: string | null | undefined) =>
  (v || "").toString().trim().toLowerCase().replace(/[\s_]+/g, "-");

// Hydrate synchronously from localStorage so the first popup is already correct.
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) cache = JSON.parse(raw) || {};
  const rawFmt = localStorage.getItem(FORMAT_STORAGE_KEY);
  if (rawFmt) formatCache = JSON.parse(rawFmt) || {};
} catch {
  cache = {};
  formatCache = {};
}

export async function loadCommunityTypes(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = (async () => {
    try {
      const { data, error } = await supabase.rpc("get_community_types");
      if (error || !Array.isArray(data)) return;
      const next: Record<string, CommunityType> = {};
      const nextFmt: Record<string, FlatFormat> = {};
      for (const row of data as any[]) {
        const type: CommunityType = row.community_type === "villa" ? "villa" : "apartment";
        const fmt: FlatFormat = (row.flat_format || "standard").toString();
        for (const key of [row.value, row.name, row.id]) {
          if (key) {
            next[norm(key)] = type;
            nextFmt[norm(key)] = fmt;
          }
        }
      }
      cache = next;
      formatCache = nextFmt;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      localStorage.setItem(FORMAT_STORAGE_KEY, JSON.stringify(nextFmt));
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

/**
 * Flat-number format of a community.
 * - "standard": tower/floor/door is encoded inside flat_no (e.g. Prestige High Fields)
 * - anything else (e.g. "tower_flat"): the community has real Block/Building records
 *   and the block must come from the booking, never from flat_no digits.
 */
export function getCommunityFlatFormat(community: string | null | undefined): FlatFormat {
  const key = norm(community);
  if (!key) return "standard";
  return formatCache[key] || "standard";
}

export function isBlockBasedCommunity(community: string | null | undefined): boolean {
  return getCommunityFlatFormat(community) !== "standard";
}
