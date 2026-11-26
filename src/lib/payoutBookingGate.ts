import { supabase } from "@/integrations/supabase/client";

/**
 * Owner rule (2026-11-26): a worker gets bookings only after payout details are
 * ready. "Ready" is decided by the server (`workers.payout_ready`); anything
 * other than an explicit `true` — false, null, missing, or a failed read — counts
 * as NOT ready.
 */
export function payoutAllowsBookings(payoutReady: unknown): boolean {
  return payoutReady === true;
}

/** Fresh server read of the signed-in worker's payout readiness. Fails closed. */
export async function readPayoutReadyFromServer(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data, error } = await supabase
      .from("workers")
      .select("id, payout_ready")
      .or(`user_id.eq.${user.id},id.eq.${user.id}`)
      .maybeSingle();
    if (error) return false;
    return payoutAllowsBookings(data?.payout_ready);
  } catch {
    return false;
  }
}
