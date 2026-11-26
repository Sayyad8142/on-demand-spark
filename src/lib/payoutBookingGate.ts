import { supabase } from "@/integrations/supabase/client";

/**
 * Owner rule (2026-11-26): a worker gets bookings only after the server says
 * payout is ready. The Admin backend is the single source of truth via
 * `get_my_payout_readiness()` (bank details + Cashfree bank beneficiary +
 * Admin approval). While Admin's `enforced` switch is off, the strict check is
 * shown to the worker but bookings follow the existing server flag
 * (`workers.payout_ready`). Anything unknown or failed counts as NOT ready.
 */
export const STRICT_READINESS_FOLLOWS_ADMIN_SWITCH = true;

export type ReadinessMissing = "bank_details" | "cashfree_bank_beneficiary" | "admin_approval" | string;
export interface PayoutReadiness {
  ready: boolean;
  enforced: boolean;
  hasBankDetails: boolean;
  beneficiaryRegistered: boolean;
  adminApproved: boolean;
  missing: ReadinessMissing[];
}

export function payoutAllowsBookings(payoutReady: unknown): boolean {
  return payoutReady === true;
}

/** Strict parser for get_my_payout_readiness(); malformed → null (not ready). */
export function parsePayoutReadiness(raw: unknown): PayoutReadiness | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const bools = ["ready", "has_bank_details", "beneficiary_registered", "admin_approved"] as const;
  if (bools.some((k) => typeof o[k] !== "boolean")) return null;
  const missing = Array.isArray(o.missing) ? o.missing.filter((m): m is string => typeof m === "string") : [];
  return {
    ready: o.ready === true,
    enforced: o.enforced === true,
    hasBankDetails: o.has_bank_details === true,
    beneficiaryRegistered: o.beneficiary_registered === true,
    adminApproved: o.admin_approved === true,
    missing,
  };
}

/** Booking decision from server values only. */
export function readinessAllowsBookings(readiness: PayoutReadiness | null, legacyPayoutReady: unknown, followSwitch = STRICT_READINESS_FOLLOWS_ADMIN_SWITCH): boolean {
  if (!readiness) return false;
  if (readiness.ready) return true;
  if (followSwitch && !readiness.enforced) return payoutAllowsBookings(legacyPayoutReady);
  return false;
}

type LooseRpc = (name: string) => Promise<{ data: unknown; error: unknown }>;

export async function readPayoutReadinessFromServer(): Promise<PayoutReadiness | null> {
  try {
    const { data, error } = await (supabase.rpc as unknown as LooseRpc)("get_my_payout_readiness");
    if (error) return null;
    return parsePayoutReadiness(data);
  } catch { return null; }
}

/** Fresh server read of whether this worker may get bookings. Fails closed. */
export async function readPayoutReadyFromServer(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const [readiness, legacy] = await Promise.all([
      readPayoutReadinessFromServer(),
      supabase.from("workers").select("id, payout_ready").or(`user_id.eq.${user.id},id.eq.${user.id}`).maybeSingle(),
    ]);
    if (legacy.error) return false;
    return readinessAllowsBookings(readiness, legacy.data?.payout_ready);
  } catch {
    return false;
  }
}
