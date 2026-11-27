import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
import { AddBankDetailsCard } from "@/components/bank/AddBankDetailsCard";
import { BankStatusBadge } from "@/components/bank/BankStatusBadge";
import { parseBankDetails } from "@/lib/bankSelfService";

// Live answer shape for current workers: Cashfree synced, legacy status still "pending".
const live = { status: "pending", can_edit: false, payout_registration: "registered", bank_setup_status: "registered", restricts_work: false };

describe("bank status display", () => {
  it("a Cashfree-registered worker sees a green Registered badge and no Pending card", () => {
    const bank = parseBankDetails(live)!;
    render(<BankStatusBadge setup={bank.setup} />);
    const badge = screen.getByTestId("bank-status-badge");
    expect(badge.textContent).toBe("Registered");
    expect(badge.className).toContain("text-success");
    cleanup();
    const { container } = render(<AddBankDetailsCard bank={bank} onOpen={() => {}} />);
    expect(container.textContent).toBe("");
  });
  it("saved but not yet registered shows Bank details saved", () => {
    render(<AddBankDetailsCard bank={parseBankDetails({ ...live, can_edit: true, bank_setup_status: "registering" })} onOpen={() => {}} />);
    expect(screen.getByTestId("bank-status-badge").textContent).toBe("Bank details saved");
    cleanup();
  });
  it("incorrect details show Correction required with the real reason", () => {
    render(<AddBankDetailsCard bank={parseBankDetails({ ...live, status: "verification_failed", can_edit: true, bank_setup_status: "needs_correction", failure_reason: "[permanent] Account number is invalid" })} onOpen={() => {}} />);
    expect(screen.getByTestId("bank-status-badge").textContent).toBe("Correction required");
    expect(screen.getByTestId("add-bank-message").textContent).toBe("Account number is invalid");
    cleanup();
  });
  it("duplicate-account safety review keeps its review label", () => {
    render(<AddBankDetailsCard bank={parseBankDetails({ ...live, can_edit: true, payout_registration: "review_required", bank_setup_status: "review_required" })} onOpen={() => {}} />);
    expect(screen.getByTestId("bank-status-badge").textContent).toBe("Under review");
  });
});
