import type { PricingCommunity } from '@/lib/servicePricing';

/** Display-only surge hints for the Availability grid. Never affects slots, dispatch or payouts. */
export type SurgeService = 'maid' | 'bathroom_cleaning';

/** Server `slot_adjustments_apply_to`: which booking kinds are charged today. Unknown → nothing shown. */
export function surgeApplicability(applyTo: string | null | undefined): { scheduled: boolean; instant: boolean } {
  const v = (applyTo ?? '').toLowerCase().trim();
  if (v === 'scheduled') return { scheduled: true, instant: false };
  if (v === 'instant') return { scheduled: false, instant: true };
  if (v === 'all' || v === 'both' || v === 'scheduled_and_instant' || v === 'instant_and_scheduled') return { scheduled: true, instant: true };
  return { scheduled: false, instant: false };
}

/** Worker share of an adjustment after the community commission (floor on the fee, like the payout core). */
export function workerSurgeEstimate(adjustment: number, percent: number): number | null {
  if (!Number.isInteger(adjustment) || !Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  const abs = Math.abs(adjustment);
  const net = abs - Math.floor((abs * percent) / 100);
  return adjustment < 0 ? -net : net;
}

/** Services with at least one non-zero 30-minute surge in this community. */
export function surgeServices(c: PricingCommunity | null): SurgeService[] {
  if (!c || !surgeApplicability(c.live?.slotsApplyTo).scheduled && !surgeApplicability(c.live?.slotsApplyTo).instant) return [];
  const order: SurgeService[] = ['maid', 'bathroom_cleaning'];
  return order.filter(s => c.slots.some(r => r.service_key === s && isHalfHour(r.slot_time) && r.adjustment_inr !== 0));
}

function isHalfHour(t: string) { const m = Number(t.slice(3, 5)); return m === 0 || m === 30; }

/** Map "HH:MM:SS" slot start → worker estimate (non-zero only). Same for all weekdays. Missing = ₹0 (absent). */
export function surgeBySlot(c: PricingCommunity | null, service: SurgeService | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!c || !service) return out;
  const a = surgeApplicability(c.live?.slotsApplyTo);
  if (!a.scheduled && !a.instant) return out;
  for (const r of c.slots) {
    if (r.service_key !== service || !isHalfHour(r.slot_time)) continue;
    const hh = Number(r.slot_time.slice(0, 2));
    if (hh < 7 || hh >= 19) continue;
    const est = workerSurgeEstimate(r.adjustment_inr, c.commission.percent);
    if (est) out.set(`${r.slot_time.slice(0, 5)}:00`, est);
  }
  return out;
}
