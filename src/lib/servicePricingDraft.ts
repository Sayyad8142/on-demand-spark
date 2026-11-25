import { z } from 'zod';
import type { PricingCatalogue, PricingCommunity } from './servicePricing';

const money = z.number().finite().int().nonnegative().max(10_000_000);
const text = z.string().trim().min(1).max(500);
const timestamp = z.string().datetime({ offset: true });
// Community values are Admin slugs (e.g. prestige-high-fields, my_home_bhooja), matched case-insensitively by the server.
const communityKey = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/);
const row = z.object({ flat_size: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._ -]{0,49}$/),
  task: z.enum(['floor_cleaning', 'dish_washing', 'combined']), price_inr: money, source: text, worker_estimate_inr: money });
const draft = z.object({
  version: z.literal('worker-service-pricing-v1'), revision: text,
  last_updated_at: timestamp, generated_at: timestamp,
  loyalty_tiers: z.array(z.object({ id: text, min_completed: money, max_completed: money.nullable(), surcharge_inr: money })).max(100),
  loyalty_note: text,
  earnings_note: text.optional(),
  communities: z.array(z.object({
    community: communityKey, community_name: text,
    commission_percent: z.number().finite().min(0).max(100),
    maid: z.array(row).max(300),
    combined: z.array(z.object({ flat_size: z.string().trim().min(1).max(50), price_inr: money, worker_estimate_inr: money })).max(100).optional(),
    dish_extras: z.array(z.object({ intensity: z.enum(['light', 'medium', 'heavy']), extra_inr: money.nullable(), label: text.nullable(), description: text.nullable(),
      charged_today_inr: money.optional(), matches: z.boolean().optional() })).max(3),
    bathroom: z.object({ unit_price_inr: money.positive(), glass_partition_price_inr: money.nullable(), source: text,
      glass_charged_today_inr: money.optional(), glass_matches: z.boolean().optional() }).nullable(),
    slot_adjustments_apply_to: text.optional(),
    discrepancies: z.array(z.object({ item: text, issue: text })).max(100).optional(),
    slot_adjustments: z.array(z.object({ service: z.enum(['maid', 'bathroom_cleaning']),
      slot_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/), adjustment_inr: z.number().finite().int().min(-10_000_000).max(10_000_000) })).max(1000),
  })).max(100),
});

/** Hosted `get_my_service_pricing` (worker-service-pricing-v1), deployed 25 Nov 2026. */
export function parseServicePricingDraft(raw: unknown): PricingCatalogue {
  const data = draft.parse(raw);
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(data.communities.map(c => c.community.toLowerCase()))) throw new Error('ambiguous_communities');
  const tiers = [...data.loyalty_tiers].sort((a, b) => a.min_completed - b.min_completed);
  if (!unique(tiers.map(t => t.id)) || tiers.some((t, i) => (t.max_completed !== null && t.max_completed < t.min_completed) ||
    (i < tiers.length - 1 && (t.max_completed === null || t.max_completed >= (tiers[i + 1]?.min_completed ?? 0))))) throw new Error('invalid_tier');
  const communities: PricingCommunity[] = data.communities.map(c => {
    if (!unique(c.maid.map(r => `${r.flat_size}:${r.task}`)) || !unique(c.dish_extras.map(r => r.intensity)) ||
      !unique(c.slot_adjustments.map(r => `${r.service}:${r.slot_time.slice(0, 5)}`))) throw new Error('ambiguous_rates');
    const services: PricingCommunity['services'] = [];
    // Examples use what bookings charge today (server-reported); configured values are shown separately.
    const workloads = c.dish_extras.flatMap(w => { const charge = w.charged_today_inr ?? w.extra_inr; return charge === null ? [] :
      [{ intensity: w.intensity, label: w.label ?? w.intensity, description: w.description ?? '', extra_inr: charge, source: 'global' as const }]; });
    const glassCharge = c.bathroom ? c.bathroom.glass_charged_today_inr ?? c.bathroom.glass_partition_price_inr : null;
    if (c.maid.length || c.dish_extras.length) services.push({ service_key: 'maid', flat_sizes: [], dish_workloads: workloads });
    if (c.bathroom && glassCharge !== null) services.push({ service_key: 'bathroom_cleaning', unit_price_inr: c.bathroom.unit_price_inr,
      glass_partition_price_inr: glassCharge, glass_quantity_rule: 'all_selected_bathrooms',
      source: c.bathroom.source === 'community' ? 'community' : 'global', customer_client_quantity_range: { min: 1, max: 1 } });
    // Returned identities are display-only. The draft does not attest assignment provenance or quantity limits.
    return { id: c.community, value: c.community, name: c.community_name, association_verification: 'current_worker_row',
      commission: { percent: c.commission_percent, source: 'communities.platform_fee_percent', rounding: 'floor_whole_rupees', estimate_only: true },
      services, slots: c.slot_adjustments.map(s => ({ service_key: s.service, slot_time: s.slot_time, adjustment_inr: s.adjustment_inr })),
      loyalty: { depends_on_customer: true, personalised_amount_inr: null, parity_verified: false,
        admin_tiers: tiers.map(t => ({ min_completed: t.min_completed, max_completed: t.max_completed, surcharge_inr: t.surcharge_inr })) },
      warnings: [], loyalty_note: data.loyalty_note, earnings_note: data.earnings_note,
      draft_maid: [...c.maid.map(r => ({ flat_size: r.flat_size, task: r.task, price_inr: r.price_inr, source: r.source, worker_estimate_inr: r.worker_estimate_inr })),
        ...(c.maid.some(r => r.task === 'combined') ? [] : (c.combined ?? []).map(r => ({ flat_size: r.flat_size, task: 'combined' as const, price_inr: r.price_inr, source: 'combined', worker_estimate_inr: r.worker_estimate_inr })))],
      live: { dish: c.dish_extras.map(w => ({ intensity: w.intensity, label: w.label ?? w.intensity, description: w.description ?? '', configured: w.extra_inr, charged: w.charged_today_inr ?? null })),
        glass: c.bathroom ? { configured: c.bathroom.glass_partition_price_inr, charged: c.bathroom.glass_charged_today_inr ?? null } : null,
        discrepancies: (c.discrepancies ?? []).map(x => ({ item: String(x.item), issue: String(x.issue) })), slotsApplyTo: c.slot_adjustments_apply_to ?? null } };
  });
  return { schema_version: 'worker-pricing-catalogue-v1', currency: 'INR', time_zone: 'Asia/Kolkata',
    generated_at: data.generated_at, last_updated_at: data.last_updated_at, config_revision: data.revision,
    quote_status: 'parity_unverified', customer_specific_quote_available: false, communities };
}

/** Read-only estimate for NEW bookings with today's catalogue percent: the hosted _create_worker_payout_core floors
 * the fee on the WHOLE booking price. Excludes tips/loyalty. Real job money is only ever read back from the server. */
export function pricingExample(base: number, extra: number, adjustment: number, percent: number) {
  if (![base, extra, adjustment, percent].every(Number.isFinite) || ![base, extra, adjustment].every(Number.isInteger) ||
    base < 0 || extra < 0 || percent < 0 || percent > 100) return null;
  const total = base + extra + adjustment;
  if (total < 0 || !Number.isSafeInteger(total)) return null;
  const fee = Math.floor(total * percent / 100);
  return { total, fee, estimate: total - fee };
}

/** Flat sizes and tasks in the server's order; nothing is added that the server did not return. */
export function draftFlatGroups(rows: PricingCommunity['draft_maid']) {
  const groups = new Map<string, NonNullable<PricingCommunity['draft_maid']>>();
  for (const r of rows ?? []) groups.set(r.flat_size, [...(groups.get(r.flat_size) ?? []), r]);
  return [...groups].map(([flat_size, tasks]) => ({ flat_size, tasks }));
}
