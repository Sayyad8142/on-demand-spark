import { supabase } from "@/integrations/supabase/client";

/**
 * Owner rule + Cashfree IMPS contract (2026-11-26): bank readiness decides
 * bookings only when Admin's mandatory-bank switch is ON. The canonical answer
 * is `get_my_payout_readiness()` (bank details + Cashfree bank beneficiary +
 * Admin approval); the database itself enforces it on availability, offers and
 * acceptance when the switch is on. The app never invents a block: it stops
 * bookings only when the server explicitly says `enforced:true, ready:false`.
 * The legacy `workers.payout_ready` flag is never used to decide or to label
 * a worker bank-ready.
 */
export const STRICT_READINESS_FOLLOWS_ADMIN_SWITCH = true;

export type ReadinessMissing = "bank_details" | "cashfree_bank_beneficiary" | "admin_approval" | string;
export interface PayoutReadiness {
  workerId: string | null;
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
    workerId: typeof o.worker_id === "string" && o.worker_id ? o.worker_id : null,
    ready: o.ready === true,
    enforced: o.enforced === true,
    hasBankDetails: o.has_bank_details === true,
    beneficiaryRegistered: o.beneficiary_registered === true,
    adminApproved: o.admin_approved === true,
    missing,
  };
}

/**
 * Booking decision from the server's canonical readiness only. Unknown/failed
 * reads do not block: the server still refuses unready workers when enforcing.
 */
export function readinessAllowsBookings(readiness: PayoutReadiness | null, followSwitch = STRICT_READINESS_FOLLOWS_ADMIN_SWITCH): boolean {
  if (!readiness || readiness.ready) return true;
  if (followSwitch && !readiness.enforced) return true;
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

/** Fresh server read: false only when Admin enforces and the server says not ready. */
export async function readPayoutReadyFromServer(): Promise<boolean> {
  return readinessAllowsBookings(await readPayoutReadinessFromServer());
}
