// Admin must grant and certify accept_booking before this preparation is activated.
// Never fall back after a secure-endpoint failure.
export const SECURE_OFFER_ACCEPTANCE_ENABLED = false;
export function offerAcceptanceRpc(secure = SECURE_OFFER_ACCEPTANCE_ENABLED): 'accept_booking' | 'try_accept_booking' {
  return secure ? 'accept_booking' : 'try_accept_booking';
}