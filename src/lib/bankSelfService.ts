import { supabase } from "@/integrations/supabase/client";
import type { PayoutReadiness } from "@/lib/payoutBookingGate";
import type { BankInput } from "@/lib/bankOnboarding";

/**
 * Worker self-service bank submission through the Admin-owned RPC
 * `submit_my_bank_details` (spec: docs/bank-self-service-2026-11-27/HANDOFF.md).
 * The worker is taken from the session server-side; the app never writes bank
 * fields into `workers` and never stores the entered values. Bank status is
 * display-only and never decides availability, offers, acceptance or completion.
 */
export type BankStatus = "none" | "pending" | "verified" | "failed";

export function bankStatusFor(r: PayoutReadiness | null): BankStatus | null {
  if (!r) return null;
  if (r.verificationStatus === "failed") return "failed";
  if (!r.hasBankDetails) return "none";
  if (r.verificationStatus === "verified" || r.beneficiaryRegistered) return "verified";
  return "pending";
}

/** Form is offered only when the server says no bank details or verification failed. */
export const canSubmitBank = (s: BankStatus | null) => s === "none" || s === "failed";

export type SubmitBankOutcome =
  | { ok: true }
  | { ok: false; error: "already_submitted" | "invalid_account" | "account_mismatch" | "invalid_ifsc" | "account_holder_required" | "bank_name_required" | "not_signed_in" | "unavailable" | "unknown" };

const KNOWN = ["already_submitted", "invalid_account", "account_mismatch", "invalid_ifsc", "account_holder_required", "bank_name_required", "not_signed_in"] as const;

export function parseSubmitBankResponse(data: unknown, error: { message?: string; code?: string } | null): SubmitBankOutcome {
  if (error) {
    const m = `${error.message ?? ""} ${error.code ?? ""}`;
    if (/PGRST202|42883|Could not find the function/i.test(m)) return { ok: false, error: "unavailable" };
    const hit = KNOWN.find((k) => m.includes(k));
    if (hit) return { ok: false, error: hit };
    if (m.includes("28000")) return { ok: false, error: "not_signed_in" };
    return { ok: false, error: "unknown" };
  }
  const o = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  if (o?.ok === true) return { ok: true };
  const e = typeof o?.error === "string" ? o.error : "";
  const hit = KNOWN.find((k) => k === e);
  return { ok: false, error: hit ?? "unknown" };
}

export const SUBMIT_BANK_ERRORS: Record<Exclude<SubmitBankOutcome, { ok: true }>["error"], string> = {
  already_submitted: "Your bank details are already submitted. To change them, please call manager.",
  invalid_account: "Account number must be 9–18 digits",
  account_mismatch: "Account numbers do not match",
  invalid_ifsc: "Invalid IFSC code (e.g., HDFC0001234)",
  account_holder_required: "Account holder name is required",
  bank_name_required: "Bank name is required",
  not_signed_in: "Please verify your phone number again.",
  unavailable: "Adding bank details in the app opens soon. Please call manager for now.",
  unknown: "Could not save bank details. Please try again.",
};

type LooseRpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

let inFlight: Promise<SubmitBankOutcome> | null = null;

/** Single-flight: a double tap never sends two submissions. */
export function submitMyBankDetails(bank: BankInput & { bankName: string }, call: LooseRpc = supabase.rpc as unknown as LooseRpc): Promise<SubmitBankOutcome> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const { data, error } = await call("submit_my_bank_details", {
        p_account_holder: bank.holder.trim(),
        p_account_number: bank.account.trim(),
        p_confirm_account_number: bank.confirmation.trim(),
        p_ifsc: bank.ifsc.trim().toUpperCase(),
        p_bank_name: bank.bankName.trim(),
      });
      return parseSubmitBankResponse(data, error);
    } catch { return { ok: false as const, error: "unknown" as const }; }
    finally { inFlight = null; }
  })();
  return inFlight;
}
