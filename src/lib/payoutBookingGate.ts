import { supabase } from "@/integrations/supabase/client";

/**
 * Payout readiness is display-only. Bank details never restrict work in the
 * app (owner 2026-11-27); independent approval and booking safeguards remain.
 */

export type ReadinessMissing = "bank_details" | "cashfree_bank_beneficiary" | "admin_approval" | string;
export interface PayoutReadiness {
  workerId: string | null;
  ready: boolean;
  enforced: boolean;
  hasBankDetails: boolean;
  beneficiaryRegistered: boolean;
  adminApproved: boolean;
  missing: ReadinessMissing[];
  /** Optional Admin fields (staged contract): display only, never decide bookings. */
  verificationStatus: "pending" | "verified" | "failed" | null;
  accountLast4: string | null;
  bankName: string | null;
}

/** Strict parser for get_my_payout_readiness(); malformed → null (not ready). */
export function parsePayoutReadiness(raw: unknown): PayoutReadiness | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const bools = ["ready", "has_bank_details", "beneficiary_registered", "admin_approved"] as const;
  if (bools.some((k) => typeof o[k] !== "boolean")) return null;
  const missing = Array.isArray(o.missing) ? o.missing.filter((m): m is string => typeof m === "string") : [];
  return {
    workerId: typeof o.worker_id === "string" && o.worker_id ? o.worker_id : null,
    ready: o.ready === true,
    enforced: o.enforced === true,
    hasBankDetails: o.has_bank_details === true,
    beneficiaryRegistered: o.beneficiary_registered === true,
    adminApproved: o.admin_approved === true,
    missing,
    verificationStatus: o.bank_verification_status === "pending" || o.bank_verification_status === "verified" || o.bank_verification_status === "failed" ? o.bank_verification_status : null,
    accountLast4: typeof o.bank_account_last4 === "string" && /^\d{4}$/.test(o.bank_account_last4) ? o.bank_account_last4 : null,
    bankName: typeof o.bank_name === "string" && o.bank_name.trim() ? o.bank_name.trim().slice(0, 60) : null,
  };
}

/**
 * Owner rule 2026-11-27: bank details never restrict work in the app,
 * regardless of Admin settings. Readiness stays display-only.
 */
export function readinessAllowsBookings(_readiness?: PayoutReadiness | null): boolean {
  return true;
}

type LooseRpc = (name: string) => Promise<{ data: unknown; error: unknown }>;

export async function readPayoutReadinessFromServer(): Promise<PayoutReadiness | null> {
  try {
    const { data, error } = await (supabase.rpc.bind(supabase) as unknown as LooseRpc)("get_my_payout_readiness");
    if (error) return null;
    return parsePayoutReadiness(data);
  } catch { return null; }
}

