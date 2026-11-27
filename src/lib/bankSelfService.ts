import { supabase } from "@/integrations/supabase/client";
import type { BankInput } from "@/lib/bankOnboarding";

/**
 * Worker bank self-service through Admin's deployed `get_my_bank_details` and
 * `submit_my_bank_details` RPCs. The worker comes from the session server-side;
 * the app never writes bank columns, stores entered values or calls Cashfree.
 * Bank status is display-only and never decides any booking step.
 */
export type BankStatus = "none" | "pending" | "verified" | "failed";
/**
 * What the worker sees, from Admin's `bank_setup_status` (Cashfree beneficiary
 * registration). `status` stays the edit/lock authority; it says "pending"
 * even after Cashfree registration, so it must never drive the label.
 */
export type BankSetup = "none" | "saved" | "registered" | "correction" | "review";

export interface BankDetails {
  status: BankStatus;
  setup: BankSetup;
  canEdit: boolean;
  failureReason: string | null;
  accountHolderName: string | null;
  accountNumberMasked: string | null;
  ifsc: string | null;
  bankName: string | null;
}

const STATUS: Record<string, BankStatus> = { not_submitted: "none", pending: "pending", verified: "verified", verification_failed: "failed" };
const SETUP: Record<string, BankSetup> = { not_submitted: "none", registering: "saved", retrying: "saved", registered: "registered", needs_correction: "correction", review_required: "review" };
/** Older answers without `bank_setup_status`: derive from the legacy fields, never from guesses. */
function legacySetup(status: BankStatus, registration: unknown): BankSetup {
  if (status === "none") return "none";
  if (status === "failed") return "correction";
  if (status === "verified" || registration === "registered") return "registered";
  return registration === "review_required" ? "review" : "saved";
}
const text = (v: unknown, max = 100) => typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** Strict parser for get_my_bank_details(); unknown/malformed → null. */
export function parseBankDetails(raw: unknown): BankDetails | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const status = typeof o.status === "string" ? STATUS[o.status] : undefined;
  if (!status || typeof o.can_edit !== "boolean") return null;
  let setup: BankSetup | undefined;
  if (o.bank_setup_status === undefined || o.bank_setup_status === null) setup = legacySetup(status, o.payout_registration);
  else setup = typeof o.bank_setup_status === "string" ? SETUP[o.bank_setup_status] : undefined;
  if (!setup) return null;
  const masked = typeof o.account_number_masked === "string" && /^X{4}\d{4}$/.test(o.account_number_masked) ? o.account_number_masked : null;
  return {
    status,
    setup,
    canEdit: o.can_edit,
    failureReason: text(o.failure_reason, 300),
    accountHolderName: text(o.account_holder_name),
    accountNumberMasked: masked,
    ifsc: text(o.ifsc, 11),
    bankName: text(o.bank_name),
  };
}

export function bankStatusFor(d: BankDetails | null): BankStatus | null { return d?.status ?? null; }
export function bankSetupFor(d: BankDetails | null): BankSetup | null { return d?.setup ?? null; }

/** The server permits pending corrections too; verified accounts always remain locked. */
export const canSubmitBank = (d: BankDetails | null) => !!d && d.canEdit && d.status !== "verified";

/** Display text for server failure reasons; free-text Admin notes are shown as received. */
export function failureReasonText(reason: string | null): string {
  // Cashfree errors arrive as "[permanent] message"; show only the message.
  reason = reason ? reason.replace(/^\[[a-z_ -]+\]\s*/i, "").trim() || null : null;
  switch (reason) {
    case "blocked_by_admin": return "Bank changes are locked. Please call manager.";
    case "rejected_by_admin": return "Didi Now could not accept these bank details. Please check and submit again.";
    case "incomplete_or_invalid_details": return "Some bank details are missing or incorrect. Please check and submit again.";
    case "bank_registration_failed": return "The bank could not confirm this account. Please check and submit again.";
    default: return reason ?? "We could not verify your bank account. Please check and submit again.";
  }
}

type LooseRpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;

export async function readMyBankDetails(call: LooseRpc = supabase.rpc.bind(supabase) as unknown as LooseRpc): Promise<BankDetails | null> {
  try {
    const { data, error } = await call("get_my_bank_details");
    return error ? null : parseBankDetails(data);
  } catch { return null; }
}

export type SubmitBankOutcome =
  | { ok: true; outcome: "submitted" | "corrected" | "unchanged"; bank: BankDetails | null }
  | { ok: false; error: SubmitBankError; bank?: BankDetails | null };

const KNOWN = ["account_holder_required", "invalid_account", "account_mismatch", "invalid_ifsc", "bank_name_required", "verified_account_locked", "bank_blocked", "same_details_as_failed", "too_many_attempts", "worker_not_found", "not_signed_in"] as const;
export type SubmitBankError = typeof KNOWN[number] | "unavailable" | "unknown";

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
  const bank = parseBankDetails(o?.bank);
  if (o?.success === true) {
    const outcome = o.outcome === "submitted" || o.outcome === "corrected" || o.outcome === "unchanged" ? o.outcome : null;
    return outcome ? { ok: true, outcome, bank } : { ok: false, error: "unknown" };
  }
  const e = typeof o?.error === "string" ? o.error : "";
  const hit = KNOWN.find((k) => k === e);
  return { ok: false, error: hit ?? "unknown", bank };
}

export const SUBMIT_BANK_ERRORS: Record<SubmitBankError, string> = {
  invalid_account: "Account number must be 9–18 digits",
  account_mismatch: "Account numbers do not match",
  invalid_ifsc: "Invalid IFSC code (e.g., HDFC0001234)",
  account_holder_required: "Account holder name is required",
  bank_name_required: "Bank name is required",
  verified_account_locked: "Your bank account is verified. To change it, please call manager.",
  bank_blocked: "Bank changes are locked. Please call manager.",
  same_details_as_failed: "These details failed verification. Please correct them before submitting.",
  too_many_attempts: "Too many attempts. Please try again after 24 hours or call manager.",
  worker_not_found: "Your worker account was not found. Please call manager.",
  not_signed_in: "Please verify your phone number again.",
  unavailable: "Could not reach Didi Now. Please try again.",
  unknown: "Could not save bank details. Please try again.",
};

let inFlight: Promise<SubmitBankOutcome> | null = null;

/** Single-flight: a double tap never sends two submissions. */
export function submitMyBankDetails(bank: BankInput & { bankName: string }, call: LooseRpc = supabase.rpc.bind(supabase) as unknown as LooseRpc): Promise<SubmitBankOutcome> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const { data, error } = await call("submit_my_bank_details", {
        p_account_holder_name: bank.holder.trim(),
        p_account_number: bank.account.trim(),
        p_account_number_confirm: bank.confirmation.trim(),
        p_ifsc: bank.ifsc.trim().toUpperCase(),
        p_bank_name: bank.bankName.trim(),
      });
      return parseSubmitBankResponse(data, error);
    } catch { return { ok: false as const, error: "unknown" as const }; }
    finally { inFlight = null; }
  })();
  return inFlight;
}
