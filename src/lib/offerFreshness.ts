/**
 * Offer freshness — decides whether a polled/recovered offer may be shown as
 * a NEW offer. Display-only: acceptance authority stays with the server RPC.
 */
export interface PolledOffer {
  status?: string | null;
  timeout_at?: string | null;
  recovered?: boolean | null;
}

/** Minimum remaining time for an offer to be worth showing. */
export const MIN_REMAINING_MS = 3_000;

export function isFreshOffer(item: PolledOffer, nowMs: number = Date.now()): boolean {
  // Server-"recovered" offers already timed out; their timeout_at is synthetic.
  if (item.recovered === true) return false;
  if (item.status && !["pending", "sent", "queued"].includes(item.status)) return false;
  if (!item.timeout_at) return false;
  const t = Date.parse(item.timeout_at);
  if (Number.isNaN(t)) return false;
  return t - nowMs > MIN_REMAINING_MS;
}

/** Window event used to ask the polling fallback for an immediate re-fetch. */
export const OFFERS_RESYNC_EVENT = "didi:offers-resync";

export function requestOffersResync(reason: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OFFERS_RESYNC_EVENT, { detail: { reason } }));
}

/**
 * Tracks realtime channel status; returns true when a SUBSCRIBED follows a
 * disconnect (i.e. a reconnect that needs backfill). First connect → false.
 */
export function createReconnectDetector() {
  let everSubscribed = false;
  let lostSinceSubscribed = false;
  return (status: string): boolean => {
    if (status === "SUBSCRIBED") {
      const isReconnect = everSubscribed && lostSinceSubscribed;
      everSubscribed = true;
      lostSinceSubscribed = false;
      return isReconnect;
    }
    if (everSubscribed && (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")) {
      lostSinceSubscribed = true;
    }
    return false;
  };
}
