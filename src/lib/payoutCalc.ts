/**
 * Worker payout calculation utility.
 * Centralizes the platform fee logic so display matches backend.
 * 
 * IMPORTANT: The backend edge function (complete-booking-with-otp) uses
 * the same 20% platform fee. If that changes, update PLATFORM_FEE_RATE here too.
 */

const PLATFORM_FEE_RATE = 0.20;

/** Calculate net worker payout from gross booking amount */
export function calcWorkerPayout(grossAmount: number | null | undefined): number {
  if (!grossAmount || grossAmount <= 0) return 0;
  return Math.round(grossAmount * (1 - PLATFORM_FEE_RATE));
}

/** Calculate platform fee from gross booking amount */
export function calcPlatformFee(grossAmount: number | null | undefined): number {
  if (!grossAmount || grossAmount <= 0) return 0;
  return Math.round(grossAmount * PLATFORM_FEE_RATE);
}
