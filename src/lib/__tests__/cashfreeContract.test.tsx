import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { classifyBeneficiaryResponse, requestOwnBeneficiary } from "@/lib/bankOnboarding";
import { parsePayoutReadiness } from "@/lib/payoutBookingGate";
import { EarningsHistorySection } from "@/components/payouts/hybrid/EarningsHistorySection";
import type { HybridPayoutClient } from "@/lib/hybridPayoutApi";

describe("bank beneficiary request (contract section 3)", () => {
  it("a simulated beneficiary is never treated as created", () => {
    expect(classifyBeneficiaryResponse({ success: true, outcome: "created", simulated: true }, null)).toBe("simulated");
    expect(classifyBeneficiaryResponse({ success: true, outcome: "reused" }, null)).toBe("reused");
  });
  it("maps documented error statuses", () => {
    expect([401, 403, 404, 422, 502, 500].map((s) => classifyBeneficiaryResponse(null, s)))
      .toEqual(["signed_out", "forbidden", "not_found", "incomplete", "provider_failed", "unavailable"]);
  });
  it("sends only the worker's own id with no repair, and keeps no response data", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { success: true, outcome: "created", beneficiary_id: "secret", phone: "x" }, error: null });
    await expect(requestOwnBeneficiary("w-own", invoke)).resolves.toBe("created");
    expect(invoke).toHaveBeenCalledWith("create-cashfree-beneficiary", { body: { worker_id: "w-own", force_repair: false } });
  });
});

describe("readiness keeps the server's own worker id", () => {
  it("reads worker_id from get_my_payout_readiness", () => {
    expect(parsePayoutReadiness({ worker_id: "w1", ready: false, has_bank_details: true, beneficiary_registered: false, admin_approved: false, missing: [], enforced: false })?.workerId).toBe("w1");
  });
});

describe("earnings history (get_my_earnings)", () => {
  const wrap = (client: Partial<HybridPayoutClient>) =>
    render(<QueryClientProvider client={new QueryClient()}><EarningsHistorySection accountId="a1" client={client as HybridPayoutClient} /></QueryClientProvider>);
  it("shows the server's amount and label", async () => {
    wrap({ getEarnings: vi.fn().mockResolvedValue({ items: [{ earningId: "e1", bookingId: "b1", completedAt: "2026-11-26T10:00:00Z", earningInr: 450, serviceEarningInr: 450, tipInr: 0, platformFeeInr: 0, status: "awaiting_payout", statusLabel: "Awaiting 7 PM payout", payoutPath: "daily", instantSlotNo: null, payoutId: null, expectedSettlementDateIst: "2026-11-26" }], nextCursor: null }) });
    expect(await screen.findByText("Awaiting 7 PM payout")).toBeTruthy();
    expect(screen.getByText("₹450")).toBeTruthy();
  });
});
