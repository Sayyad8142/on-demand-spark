/** Isolated synthetic rates only; never imported by application code. Draft keys await Admin sample. */
export const servicePricingDraftFixture = () => ({
  schema_version: 'worker-service-pricing-v1', revision: 'synthetic-draft',
  generated_at: new Date().toISOString(), last_updated_at: '2026-11-25T07:00:00Z',
  loyalty_tiers: [{ min_completed: 0, max_completed: 3, surcharge_inr: 19 }],
  loyalty_note: 'Customer-specific loyalty is not guaranteed worker earnings.',
  communities: [{ community_id: '11111111-1111-4111-8111-111111111111', community_name: 'Preview Community', commission_percent: 7,
    maid: [
      { flat_size: '4BHK_PREMIUM', task: 'floor_cleaning', price_inr: 121, source: 'community', worker_estimate_inr: 113 },
      { flat_size: '4BHK_PREMIUM', task: 'dish_washing', price_inr: 83, source: 'global', worker_estimate_inr: 78 },
      { flat_size: '4BHK_PREMIUM', task: 'combined', price_inr: 197, source: 'community', worker_estimate_inr: 184 },
    ], dish_extras: [
      { intensity: 'light', extra_inr: 0, label: 'Light', description: 'Synthetic light workload' },
      { intensity: 'medium', extra_inr: 17, label: 'Medium', description: 'Synthetic medium workload' },
      { intensity: 'heavy', extra_inr: 31, label: 'Heavy', description: 'Synthetic heavy workload' },
    ], bathroom: { unit_price_inr: 151, glass_partition_price_inr: 0 },
    slot_adjustments: [{ service: 'maid', slot_time: '10:00:00', adjustment_inr: -13 }, { service: 'bathroom_cleaning', slot_time: '11:00', adjustment_inr: 23 }],
  }],
});