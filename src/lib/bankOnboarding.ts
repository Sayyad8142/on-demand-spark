import { supabase } from "@/integrations/supabase/client";

/**
 * Bank-first worker registration through the Admin-owned `register_worker_v2`
 * RPC (session-authenticated). The app never writes bank fields, readiness or
 * Cashfree beneficiaries into `workers`; Admin creates the beneficiary.
 */
export const SECURE_BANK_ONBOARDING_ENABLED = true;
/** Existing workers have no worker-facing bank update RPC yet (Admin dependency). */
export const BANK_UPDATE_AVAILABLE = false;
export const BANK_SERVICE_UNAVAILABLE = "Bank setup is temporarily unavailable. Please contact Didi Now.";
export const BANK_UPDATE_CONTACT = "To change bank details, please call Didi Now.";

export interface BankInput {
  holder: string; account: string; confirmation: string; ifsc: string; bankName?: string;
}

export function validateBankInput(bank: BankInput): string | null {
  if (bank.holder.trim().length < 2) return "Account holder name is required";
  if (!/^\d{9,18}$/.test(bank.account.trim())) return "Account number must be 9–18 digits";
  if (bank.account.trim() !== bank.confirmation.trim()) return "Account numbers do not match";
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bank.ifsc.trim().toUpperCase())) return "Invalid IFSC code (e.g., HDFC0001234)";
  if (bank.bankName !== undefined && bank.bankName.trim().length < 2) return "Bank name is required";
  return null;
}

/** UPI is collected only when Admin explicitly says so; anything else hides it. */
export function collectWorkerUpi(raw: unknown): boolean {
  return !!raw && typeof raw === "object" && !Array.isArray(raw)
    && (raw as Record<string, unknown>).collect_worker_upi === true;
}

type LooseRpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
const rpc = (): LooseRpc => supabase.rpc as unknown as LooseRpc;

export async function readCollectWorkerUpi(call: LooseRpc = rpc()): Promise<boolean> {
  try {
    const { data, error } = await call("get_worker_payout_onboarding_config");
    return !error && collectWorkerUpi(data);
  } catch { return false; }
}

/** Fail closed: no bank update endpoint exists for already-registered workers. */
export async function submitSecureBankDetails(): Promise<never> {
  throw new Error(BANK_SERVICE_UNAVAILABLE);
}

// ---------- registration (register_worker_v2) ----------

/** In-memory only: bank details never touch localStorage/sessionStorage/navigation state. */
let pendingBank: (BankInput & { bankName: string }) | null = null;
export function holdSignupBank(bank: BankInput & { bankName: string }) { pendingBank = { ...bank }; }
export function takeSignupBank(): (BankInput & { bankName: string }) | null { const b = pendingBank; pendingBank = null; return b; }
export function peekSignupBank() { return pendingBank; }

export const REGISTRATION_ERRORS = [
  "not_signed_in", "verified_phone_mismatch", "name_required", "invalid_phone", "account_holder_required",
  "invalid_account", "account_mismatch", "invalid_ifsc", "bank_name_required", "service_required",
  "community_required", "phone_already_registered", "login_already_linked",
] as const;
export type RegistrationError = (typeof REGISTRATION_ERRORS)[number] | "bank_details_missing" | "unknown";

/** Worker-friendly English source text (translated via displayText). */
export const REGISTRATION_ERROR_TEXT: Record<RegistrationError, string> = {
  not_signed_in: "Please verify your phone number again.",
  verified_phone_mismatch: "This phone number does not match the verified number. Please try again.",
  name_required: "Please enter your full name.",
  invalid_phone: "Please enter a valid 10-digit mobile number.",
  account_holder_required: "Account holder name is required",
  invalid_account: "Account number must be 9–18 digits",
  account_mismatch: "Account numbers do not match",
  invalid_ifsc: "Invalid IFSC code (e.g., HDFC0001234)",
  bank_name_required: "Bank name is required",
  service_required: "Select at least one service type",
  community_required: "Please select your community.",
  phone_already_registered: "This number is already registered. Please sign in.",
  login_already_linked: "This number is already registered. Please sign in.",
  bank_details_missing: "Please enter your bank details again.",
  unknown: BANK_SERVICE_UNAVAILABLE,
};

export interface RegistrationInput {
  fullName: string; phone: string; services: string[]; community: string; upiId?: string | null;
  bank: BankInput & { bankName: string };
}
export type RegistrationResult =
  | { ok: true; workerId: string; approvalStatus: string; payoutReadiness: unknown }
  | { ok: false; error: RegistrationError };

/** +91XXXXXXXXXX from any 10-digit / 91-prefixed input. */
export function toE164India(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return `+91${d.length >= 10 ? d.slice(-10) : d}`;
}

export function parseRegistrationResponse(data: unknown): RegistrationResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "unknown" };
  const o = data as Record<string, unknown>;
  if (o.ok === true && typeof o.worker_id === "string" && o.worker_id) {
    return { ok: true, workerId: o.worker_id, approvalStatus: typeof o.approval_status === "string" ? o.approval_status : "pending_approval", payoutReadiness: o.payout_readiness ?? null };
  }
  const code = typeof o.error === "string" ? o.error : "";
  return { ok: false, error: (REGISTRATION_ERRORS as readonly string[]).includes(code) ? (code as RegistrationError) : "unknown" };
}

export async function registerWorkerV2(input: RegistrationInput, call: LooseRpc = rpc()): Promise<RegistrationResult> {
  try {
    const { data, error } = await call("register_worker_v2", {
      p_full_name: input.fullName.trim(),
      p_phone: toE164India(input.phone),
      p_account_holder: input.bank.holder.trim(),
      p_account_number: input.bank.account.trim(),
      p_confirm_account_number: input.bank.confirmation.trim(),
      p_ifsc: input.bank.ifsc.trim().toUpperCase(),
      p_bank_name: input.bank.bankName.trim(),
      p_service_types: input.services,
      p_community: input.community,
      p_upi_id: input.upiId?.trim() ? input.upiId.trim() : null,
    });
    if (error) {
      const m = `${error.message ?? ""} ${error.code ?? ""}`;
      return { ok: false, error: m.includes("not_signed_in") || m.includes("28000") ? "not_signed_in" : "unknown" };
    }
    return parseRegistrationResponse(data);
  } catch { return { ok: false, error: "unknown" }; }
}
