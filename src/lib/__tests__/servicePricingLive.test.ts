import { describe, it, expect } from 'vitest';
import { parseServicePricingDraft } from '../servicePricingDraft';

// Shape of the hosted get_my_service_pricing response (worker_pricing_private.my_pricing_v1), PHF values from live tables.
const live = {
  version: 'worker-service-pricing-v1', revision: 'abc', generated_at: '2026-11-25T12:56:00.123456+00:00', last_updated_at: '2026-11-23T07:55:15.979+00:00',
  pricing_interval_minutes: 30, quarter_hour_pricing_enabled: false,
  loyalty_note: 'Loyalty amount belongs to each customer booking and is included in the booking price.',
  earnings_note: 'worker_estimate_inr is an estimate.',
  loyalty_tiers: [{ id: 't1', min_completed: 0, max_completed: 3, surcharge_inr: 0 }, { id: 't2', min_completed: 10, max_completed: null, surcharge_inr: 20 }],
  communities: [{ community: 'prestige-high-fields', community_name: 'Prestige High Fields', commission_percent: 0,
    maid: [{ flat_size: '2BHK', task: 'dish_washing', price_inr: 120, source: 'community', worker_estimate_inr: 120 },
      { flat_size: '2BHK', task: 'floor_cleaning', price_inr: 100, source: 'fallback', worker_estimate_inr: 100 }],
    combined: [{ flat_size: '2BHK', price_inr: 220, worker_estimate_inr: 220 }],
    dish_extras: [{ intensity: 'light', label: 'Light', description: '10-15 items', extra_inr: 0, charged_today_inr: 0, matches: true },
      { intensity: 'medium', label: 'Medium', description: '15-20 items', extra_inr: 19, charged_today_inr: 30, matches: false },
      { intensity: 'heavy', label: null, description: null, extra_inr: null, charged_today_inr: 50, matches: false }],
    bathroom: { unit_price_inr: 149, glass_partition_price_inr: 19, source: 'global', glass_charged_today_inr: 30, glass_matches: false },
    slot_adjustments: [{ service: 'maid', slot_time: '07:00:00', adjustment_inr: 20 }], slot_adjustments_apply_to: 'scheduled',
    discrepancies: [{ item: 'dish_medium', issue: 'Admin shows Rs19 but bookings charge Rs30' }] }],
};

describe('live service pricing response', () => {
  const c = parseServicePricingDraft(live).communities[0]!;
  it('keeps the PHF community from the server', () => expect(c.name).toBe('Prestige High Fields'));
  it('adds the combined price row', () => expect(c.draft_maid?.find(r => r.task === 'combined')?.price_inr).toBe(220));
  it('uses the current booking charge for dish extras in examples', () => {
    const maid = c.services.find(s => s.service_key === 'maid');
    expect(maid?.service_key === 'maid' && maid.dish_workloads.find(w => w.intensity === 'medium')?.extra_inr).toBe(30);
  });
  it('keeps the configured dish price separately', () => expect(c.live?.dish.find(w => w.intensity === 'medium')?.configured).toBe(19));
  it('uses Rs30 current glass charge, keeps Rs19 configured', () => {
    const b = c.services.find(s => s.service_key === 'bathroom_cleaning');
    expect(b?.service_key === 'bathroom_cleaning' && b.glass_partition_price_inr).toBe(30);
    expect(c.live?.glass?.configured).toBe(19);
  });
  it('passes Admin warnings through', () => expect(c.live?.discrepancies).toHaveLength(1));
  it('marks slot adjustments as scheduled-only', () => expect(c.live?.slotsApplyTo).toBe('scheduled'));
});
