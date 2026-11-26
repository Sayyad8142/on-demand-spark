import { supabase } from "@/integrations/supabase/client";

// No approved worker bank writer/registration endpoint is deployed yet.
// Never fall back to raw workers writes or client-created Cashfree accounts.
export const SECURE_BANK_ONBOARDING_ENABLED = false;
export const BANK_SERVICE_UNAVAILABLE = "Bank setup is temporarily unavailable. Please contact Didi Now.";

export interface BankInput {
  holder: string; account: string; confirmation: string; ifsc: string;
}

export function validateBankInput(bank: BankInput): string | null {
  if (bank.holder.trim().length < 2) return "Account holder name is required";
  if (!/^\d{9,18}$/.test(bank.account.trim())) return "Account number must be 9–18 digits";
  if (bank.account.trim() !== bank.confirmation.trim()) return "Account numbers do not match";
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bank.ifsc.trim().toUpperCase())) return "Invalid IFSC code (e.g., HDFC0001234)";
  return null;
}

export function collectWorkerUpi(raw: unknown): boolean {
  return !!raw && typeof raw === "object" && !Array.isArray(raw)
    && (raw as Record<string, unknown>).bank_required === true
    && (raw as Record<string, unknown>).collect_worker_upi === true;
}

export async function readCollectWorkerUpi(): Promise<boolean> {
  try {
    const { data, error } = await (supabase.rpc as unknown as (name: string) => Promise<{ data: unknown; error: unknown }>)("get_worker_payout_onboarding_config");
    return !error && collectWorkerUpi(data);
  } catch { return false; }
}

/** Fail closed until the Admin-owned, session-derived writer is approved. */
export async function submitSecureBankDetails(): Promise<never> {
  throw new Error(BANK_SERVICE_UNAVAILABLE);
}