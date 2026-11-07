/**
 * Worker payout calculation utility — community-driven (NO hardcoded fee).
 *
 * Source of truth: `communities.platform_fee_percent` (admin-controlled, per community).
 * Backend (`complete-booking-with-otp`) uses the SAME column when creating `worker_payouts`,
 * so on-screen numbers match the actual UPI payout.
 *
 * Fallback: 0% if community is missing or fee is not configured. The worker keeps the
 * full booking amount in that case. This is intentional — never invent a deduction
 * the backend won't actually apply.
 */

import { supabase } from "@/integrations/supabase/client";

const MAX_FEE_PERCENT = 100;
const MIN_FEE_PERCENT = 0;
const FALLBACK_FEE_PERCENT = 0; // Safe default — must match backend fallback.

// Short-lived in-memory cache of the (small) community list so cards/lists
// don't re-hit the network. Refreshed every few minutes so an Admin Panel
// fee change reaches the worker without a restart.
const FEE_CACHE_TTL_MS = 5 * 60 * 1000;
let feeRowsCache: { rows: CommunityFeeRow[]; at: number } | null = null;

export interface CommunityFeeRow {
  value: string | null;
  name: string | null;
  platform_fee_percent: number | string | null;
}

/** Clamp a fee % to a sane range. */
function clampFee(pct: number | string | null | undefined): number {
  if (pct == null || pct === "" || Number.isNaN(Number(pct))) return FALLBACK_FEE_PERCENT;
  return Math.min(MAX_FEE_PERCENT, Math.max(MIN_FEE_PERCENT, Number(pct)));
}

/**
 * Pure lookup that mirrors the backend payout rule: match the booking's
 * community on `value` (case-insensitive), then on `name`; unknown → 0%.
 */
export function matchCommunityFeePercent(
  rows: CommunityFeeRow[] | null | undefined,
  community: string | null | undefined,
): number {
  if (!community || !rows?.length) return FALLBACK_FEE_PERCENT;
  const key = community.trim().toLowerCase();
  const hit =
    rows.find((r) => (r.value ?? "").trim().toLowerCase() === key) ??
    rows.find((r) => (r.name ?? "").trim().toLowerCase() === key);
  return hit ? clampFee(hit.platform_fee_percent) : FALLBACK_FEE_PERCENT;
}

async function loadFeeRows(): Promise<CommunityFeeRow[]> {
  if (feeRowsCache && Date.now() - feeRowsCache.at < FEE_CACHE_TTL_MS) return feeRowsCache.rows;
  const { data, error } = await supabase
    .from("communities")
    .select("value, name, platform_fee_percent");
  if (error || !data) return feeRowsCache?.rows ?? [];
  const rows = data as CommunityFeeRow[];
  feeRowsCache = { rows, at: Date.now() };
  return rows;
}

/**
 * Resolve the live platform fee % for a community.
 * Returns FALLBACK_FEE_PERCENT (0) on any error/miss.
 */
export async function getCommunityFeePercent(community: string | null | undefined): Promise<number> {
  if (!community) return FALLBACK_FEE_PERCENT;
  try {
    return matchCommunityFeePercent(await loadFeeRows(), community);
  } catch {
    return FALLBACK_FEE_PERCENT;
  }
}

/** Force-refresh the fee list (e.g. after admin updates). */
export function invalidateCommunityFeeCache(_community?: string) {
  feeRowsCache = null;
}

export interface PayoutBreakdown {
  gross: number;        // What the customer pays
  feePercent: number;   // Live fee % from admin config
  feeAmount: number;    // Platform fee in ₹
  netPayout: number;    // What the worker actually earns
}

/** Pure breakdown using an already-resolved fee %. Safe for sync UI. */
export function buildPayoutBreakdown(
  grossAmount: number | null | undefined,
  feePercent: number,
): PayoutBreakdown {
  const gross = !grossAmount || grossAmount <= 0 ? 0 : Math.round(grossAmount);
  const pct = clampFee(feePercent);
  // Same rounding as the backend payout (FLOOR): the fee never rounds up
  // against the worker. Tips are never part of `gross`, so they stay 100%.
  const feeAmount = Math.floor((gross * pct) / 100);
  const netPayout = Math.max(0, gross - feeAmount);
  return { gross, feePercent: pct, feeAmount, netPayout };
}

/** Async breakdown — fetches the community fee then builds the breakdown. */
export async function resolvePayoutBreakdown(
  grossAmount: number | null | undefined,
  community: string | null | undefined,
): Promise<PayoutBreakdown> {
  const pct = await getCommunityFeePercent(community);
  return buildPayoutBreakdown(grossAmount, pct);
}

/* ------------------------------------------------------------------ */
/* Back-compat shims (synchronous). These now require an explicit fee %
   so callers can never accidentally re-introduce a hardcoded constant. */
/* ------------------------------------------------------------------ */

export function calcWorkerPayoutWithFee(
  grossAmount: number | null | undefined,
  feePercent: number,
): number {
  return buildPayoutBreakdown(grossAmount, feePercent).netPayout;
}

export function calcPlatformFeeWithRate(
  grossAmount: number | null | undefined,
  feePercent: number,
): number {
  return buildPayoutBreakdown(grossAmount, feePercent).feeAmount;
}
