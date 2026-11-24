const KEY = 'didi:shown-offer-generations:v1';
const RETAIN_MS = 30 * 60 * 1000;

function read(now: number): Record<string, number> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, at]) =>
      typeof at === 'number' && at <= now && now - at < RETAIN_MS).slice(-200));
  } catch { return {}; }
}

/** Presentation dedupe only; no personal details, tokens or assignment authority. */
export function wasOfferPresented(generation: string, now = Date.now()): boolean {
  return Object.prototype.hasOwnProperty.call(read(now), generation);
}

export function rememberOfferPresentation(generation: string, now = Date.now()): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...read(now), [generation]: now })); }
  catch { /* memory coordinator still deduplicates when storage is unavailable */ }
}