/** Presentation identity only: never authorizes an action or extends a deadline. */
export function offerGenerationKey(offer: { bookingId: string; bookingRequestId?: string; timeoutAt?: string }): string {
  const deadline = offer.timeoutAt ? Date.parse(offer.timeoutAt) : NaN;
  return `${offer.bookingId}:${offer.bookingRequestId || "legacy"}:${Number.isFinite(deadline) ? deadline : "unknown"}`;
}

export function offerSecondsLeft(deadline: string, now = Date.now()): number {
  const at = Date.parse(deadline);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : 0;
}