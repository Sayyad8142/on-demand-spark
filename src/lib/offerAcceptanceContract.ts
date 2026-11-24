// One acceptance endpoint for every web, native, overlay, notification and
// deep-link path: the existing try_accept_booking (same name/arguments as the
// published 10.0.05 build). Admin hardens it server-side; no second endpoint,
// no extra grant, never a fallback.
export const OFFER_ACCEPTANCE_RPC = 'try_accept_booking' as const;
export function offerAcceptanceRpc(): typeof OFFER_ACCEPTANCE_RPC {
  return OFFER_ACCEPTANCE_RPC;
}

// favorite-v1 offer status read. OFF until Admin confirms the final contract.
// When ON, a failed/invalid answer yields no actionable offer (no legacy fallback).
export const FAVORITE_V1_STATUS_ENABLED = false;
export const OFFER_STATUS_RPC = 'get_my_offer_status' as const;
