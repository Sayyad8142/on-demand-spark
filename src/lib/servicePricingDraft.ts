import { z } from 'zod';
import type { PricingCatalogue, PricingCommunity } from './servicePricing';

const money = z.number().finite().int().nonnegative().max(10_000_000);
const text = z.string().trim().min(1).max(500);
const timestamp = z.string().datetime({ offset: true });
const row = z.object({ flat_size: text, task: z.enum(['floor_cleaning', 'dish_washing', 'combined']),
  price_inr: money, source: text, worker_estimate_inr: money });
const draft = z.object({
  schema_version: z.literal('worker-service-pricing-v1'), revision: text,
  last_updated_at: timestamp, generated_at: timestamp,
  loyalty_tiers: z.array(z.object({ min_completed: money, max_completed: money.nullable(), surcharge_inr: money })).max(100),
  loyalty_note: text,
  communities: z.array(z.object({
    community_id: z.string().uuid(), community_name: text,
    commission_percent: z.number().finite().min(0).max(100),
    maid: z.array(row).max(300),
    dish_extras: z.array(z.object({ intensity: z.enum(['light', 'medium', 'heavy']), extra_inr: money, label: text, description: text })).max(3),
    bathroom: z.object({ unit_price_inr: money.positive(), glass_partition_price_inr: money }).nullable(),
    slot_adjustments: z.array(z.object({ service: z.enum(['maid', 'bathroom_cleaning']),
      slot_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/), adjustment_inr: z.number().finite().int().min(-10_000_000).max(10_000_000) })).max(1000),
  })).max(100),
});

/** Draft field assumptions are documented; never enable until the exact hosted payload is certified. */
export function parseServicePricingDraft(raw: unknown): PricingCatalogue {
  const data = draft.parse(raw);
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(data.communities.map(c => c.community_id))) throw new Error('ambiguous_communities');
  if (data.loyalty_tiers.some(t => t.max_completed !== null && t.max_completed < t.min_completed)) throw new Error('invalid_tier');
  const communities: PricingCommunity[] = data.communities.map(c => {
    if (!unique(c.maid.map(r => `${r.flat_size}:${r.task}`)) || !unique(c.dish_extras.map(r => r.intensity)) ||
      !unique(c.slot_adjustments.map(r => `${r.service}:${r.slot_time.slice(0, 5)}`))) throw new Error('ambiguous_rates');
    const services: PricingCommunity['services'] = [];
    if (c.maid.length || c.dish_extras.length) services.push({ service_key: 'maid', flat_sizes: [],
      dish_workloads: c.dish_extras });
    if (c.bathroom) services.push({ service_key: 'bathroom_cleaning', ...c.bathroom });
    // Returned identities are display-only. The draft does not attest assignment provenance or quantity limits.
    return { id: c.community_id, value: c.community_id, name: c.community_name,
      commission: { percent: c.commission_percent, source: 'communities.platform_fee_percent', rounding: 'floor_whole_rupees', estimate_only: true },
      services, slots: c.slot_adjustments.map(s => ({ service_key: s.service, slot_time: s.slot_time, adjustment_inr: s.adjustment_inr })),
      loyalty: { depends_on_customer: true, personalised_amount_inr: null, admin_tiers: data.loyalty_tiers, parity_verified: false },
      warnings: [], draft_maid: c.maid.map(r => ({ flat_size: r.flat_size, task: r.task, price_inr: r.price_inr, source: r.source, worker_estimate_inr: r.worker_estimate_inr })), loyalty_note: data.loyalty_note };
  });
  return { schema_version: 'worker-pricing-catalogue-v1', currency: 'INR', time_zone: 'Asia/Kolkata',
    generated_at: data.generated_at, last_updated_at: data.last_updated_at, config_revision: data.revision,
    quote_status: 'parity_unverified', customer_specific_quote_available: false, communities };
}

/** Read-only estimate: hosted _create_worker_payout_core floors the fee on the WHOLE total. No tips/loyalty. */
export function pricingExample(base: number, extra: number, adjustment: number, percent: number) {
  if (![base, extra, adjustment, percent].every(Number.isFinite) || ![base, extra, adjustment].every(Number.isInteger) ||
    base < 0 || extra < 0 || percent < 0 || percent > 100) return null;
  const total = base + extra + adjustment;
  if (total < 0 || !Number.isSafeInteger(total)) return null;
  const fee = Math.floor(total * percent / 100);
  return { total, fee, estimate: total - fee };
}