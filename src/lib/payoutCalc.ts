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

// In-memory cache so cards/lists don't re-hit the network for the same community.
const feeCache = new Map<string, number>();

/** Clamp a fee % to a sane range. */
function clampFee(pct: number | null | undefined): number {
  if (pct == null || Number.isNaN(Number(pct))) return FALLBACK_FEE_PERCENT;
  return Math.min(MAX_FEE_PERCENT, Math.max(MIN_FEE_PERCENT, Number(pct)));
}

/**
 * Resolve the live platform fee % for a community.
 * Cached after first lookup. Returns FALLBACK_FEE_PERCENT (0) on any error/miss.
 */
export async function getCommunityFeePercent(community: string | null | undefined): Promise<number> {
  if (!community) return FALLBACK_FEE_PERCENT;
  if (feeCache.has(community)) return feeCache.get(community)!;

  try {
    const { data, error } = await supabase
      .from("communities")
      .select("platform_fee_percent")
      .or(`value.eq.${community},name.eq.${community}`)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      feeCache.set(community, FALLBACK_FEE_PERCENT);
      return FALLBACK_FEE_PERCENT;
    }
    const pct = clampFee((data as any).platform_fee_percent);
    feeCache.set(community, pct);
    return pct;
  } catch {
    return FALLBACK_FEE_PERCENT;
  }
}

/** Force-refresh a community's fee (e.g. after admin updates). */
export function invalidateCommunityFeeCache(community?: string) {
  if (community) feeCache.delete(community);
  else feeCache.clear();
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
  const feeAmount = Math.round((gross * pct) / 100);
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
