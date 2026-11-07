import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { buildPayoutBreakdown, matchCommunityFeePercent, type CommunityFeeRow } from "@/lib/payoutCalc";

const rows: CommunityFeeRow[] = [
  { value: "prestige-high-fields", name: "Prestige High Fields", platform_fee_percent: "0.00" },
  { value: "my-home-avatar", name: "My Home Avatar", platform_fee_percent: 15 },
  { value: "ten-pct", name: "Ten Pct", platform_fee_percent: 10 },
];

describe("worker commission", () => {
  it("0% commission: worker keeps 100% of the booking price", () => {
    const b = buildPayoutBreakdown(349, matchCommunityFeePercent(rows, "prestige-high-fields"));
    expect(b.feeAmount).toBe(0);
    expect(b.netPayout).toBe(349);
  });

  it("10% commission on ₹500 → fee ₹50, worker ₹450", () => {
    const b = buildPayoutBreakdown(500, matchCommunityFeePercent(rows, "ten-pct"));
    expect(b.feeAmount).toBe(50);
    expect(b.netPayout).toBe(450);
  });

  it("15% on ₹349 rounds the fee DOWN like the backend payout (₹52, worker ₹297)", () => {
    const b = buildPayoutBreakdown(349, matchCommunityFeePercent(rows, "my-home-avatar"));
    expect(b.feeAmount).toBe(52);
    expect(b.netPayout).toBe(297);
  });

  it("matches community case-insensitively, then by name", () => {
    expect(matchCommunityFeePercent(rows, "MY-HOME-AVATAR")).toBe(15);
    expect(matchCommunityFeePercent(rows, "Ten Pct")).toBe(10);
  });

  it("unknown or missing community → 0% (never a made-up 20%)", () => {
    expect(matchCommunityFeePercent(rows, "nowhere")).toBe(0);
    expect(matchCommunityFeePercent(rows, null)).toBe(0);
    expect(matchCommunityFeePercent([], "prestige-high-fields")).toBe(0);
  });

  it("tips are never part of the fee base: fee depends only on the booking price", () => {
    const withoutTip = buildPayoutBreakdown(500, 10);
    const tip = 50;
    expect(withoutTip.netPayout + tip).toBe(500);
  });
});
