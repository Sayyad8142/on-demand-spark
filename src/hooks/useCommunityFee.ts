import { useEffect, useState } from "react";
import { getCommunityFeePercent, buildPayoutBreakdown, type PayoutBreakdown } from "@/lib/payoutCalc";

/**
 * React hook that resolves the live community platform fee and a payout breakdown.
 * - Reads `communities.platform_fee_percent` (admin-controlled, per community).
 * - Falls back to 0% if community is missing or fee is unconfigured.
 * - While loading, returns a breakdown using 0% so the UI never shows a fake fee.
 */
export function useCommunityFee(
  community: string | null | undefined,
  grossAmount: number | null | undefined,
): { breakdown: PayoutBreakdown; loading: boolean } {
  const [feePercent, setFeePercent] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(!!community);

  useEffect(() => {
    let active = true;
    if (!community) {
      setFeePercent(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    getCommunityFeePercent(community).then((pct) => {
      if (!active) return;
      setFeePercent(pct);
      setLoading(false);
    });
    return () => { active = false; };
  }, [community]);

  return { breakdown: buildPayoutBreakdown(grossAmount, feePercent), loading };
}
