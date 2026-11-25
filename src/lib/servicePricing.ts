import { z } from 'zod';

/** Live: hosted read-only `get_my_service_pricing` RPC (session-scoped, parameterless). */
export const SERVICE_PRICING_ENABLED = true;
const money = z.number().finite().int().nonnegative();
const text = z.string().trim().min(1).max(200);
const source = z.enum(['community', 'global']);
const maid = z.object({
  service_key: z.literal('maid'),
  flat_sizes: z.array(z.object({
    flat_size: text, floor_cleaning_inr: money, dish_washing_light_inr: money,
    combined_light_inr: money, combined_discount_inr: money, floor_source: source, dish_source: source,
  })).min(1).max(100),
  dish_workloads: z.array(z.object({ intensity: z.enum(['light','medium','heavy']), label: text,
    description: text, extra_inr: money, source })).length(3),
});
const bathroom = z.object({
  service_key: z.literal('bathroom_cleaning'), unit_price_inr: money.positive(), glass_partition_price_inr: money,
  glass_quantity_rule: z.literal('all_selected_bathrooms'), source,
  customer_client_quantity_range: z.object({min: z.number().int().positive(), max: z.number().int().positive()}),
});
const community = z.object({
  id: z.string().uuid(), value: text, name: text,
  association_verification: z.enum(['current_worker_row','admin_verified']),
  commission: z.object({percent: z.number().finite().min(0).max(100), source: z.literal('communities.platform_fee_percent'),
    rounding: z.literal('floor_whole_rupees'), estimate_only: z.literal(true)}),
  services: z.array(z.discriminatedUnion('service_key',[maid,bathroom])).max(2),
  slots: z.array(z.object({service_key:z.enum(['maid','bathroom_cleaning']),slot_time:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/),adjustment_inr:z.number().finite().int()})).max(1000),
  loyalty: z.object({depends_on_customer:z.literal(true),personalised_amount_inr:z.null(),
    admin_tiers:z.array(z.object({min_completed:money,max_completed:money.nullable(),surcharge_inr:money})).max(100),parity_verified:z.boolean()}),
  warnings: z.array(z.object({code:text,service_key:z.string().optional()})).max(50),
});
const catalogue = z.object({schema_version:z.literal('worker-pricing-catalogue-v1'),currency:z.literal('INR'),
  time_zone:z.literal('Asia/Kolkata'),generated_at:z.string().datetime({offset:true}),config_revision:text,
  quote_status:z.enum(['reference_only','parity_unverified']),customer_specific_quote_available:z.literal(false),
  communities:z.array(community).max(100),
});
export interface DraftMaidRow {
  flat_size: string; task: 'floor_cleaning' | 'dish_washing' | 'combined';
  price_inr: number; source: string; worker_estimate_inr: number;
}
export interface LivePricingExtras {
  dish: Array<{ intensity: string; label: string; description: string; configured: number | null; charged: number | null }>;
  glass: { configured: number | null; charged: number | null } | null;
  discrepancies: Array<{ item: string; issue: string }>; slotsApplyTo: string | null;
}
export type PricingCommunity = z.infer<typeof community> & { draft_maid?: DraftMaidRow[]; loyalty_note?: string; earnings_note?: string; live?: LivePricingExtras };
export type PricingCatalogue = Omit<z.infer<typeof catalogue>, 'communities'> & { communities: PricingCommunity[]; last_updated_at?: string };
export function parsePricingCatalogue(raw: unknown): PricingCatalogue {
  const data=catalogue.parse(raw);
  const unique=(values:string[])=>new Set(values).size===values.length;
  if(!unique(data.communities.map(c=>c.id)) || !unique(data.communities.map(c=>c.value))) throw new Error('ambiguous_communities');
  for(const c of data.communities){
    if(!unique(c.services.map(s=>s.service_key))) throw new Error('ambiguous_services');
    if(!unique(c.slots.map(s=>`${s.service_key}:${s.slot_time}`))) throw new Error('ambiguous_slots');
    for(const s of c.services){
      if(s.service_key==='maid' && (!unique(s.flat_sizes.map(f=>f.flat_size)) || !unique(s.dish_workloads.map(w=>w.intensity)))) throw new Error('ambiguous_rates');
      if(s.service_key==='bathroom_cleaning' && s.customer_client_quantity_range.max<s.customer_client_quantity_range.min) throw new Error('invalid_quantity');
    }
  }
  return { ...data, communities: data.communities };
}

/** Select only a returned associated community; never fall back to a different one. */
export function pricingCommunity(data:PricingCatalogue|null,id:string):PricingCommunity|null {
  return data?.communities.find(c=>c.id===id)??null;
}
export function readableFlatSize(key:string):string { return key.replace(/_/g,' ').replace(/BHK/g,' BHK').replace(/\s+/g,' ').trim(); }

/** Freshness is display-only; an old snapshot must never look live. */
export function pricingSnapshotFresh(generatedAt:string, now=Date.now()):boolean {
  const generated=Date.parse(generatedAt);
  return Number.isFinite(generated) && generated<=now && now-generated<=300_000;
}