import { describe, expect, it } from 'vitest';
import { draftFlatGroups, parseServicePricingDraft, pricingExample } from '../servicePricingDraft';
import { servicePricingDraftFixture } from './servicePricingDraftFixture';

const parsed = () => parseServicePricingDraft(servicePricingDraftFixture());

describe("Admin's draft worker-service-pricing-v1 fixture", () => {
  it('keeps every community Admin returned, in order, with their own names', () => {
    expect(parsed().communities.map(c => [c.id, c.name])).toEqual([
      ['prestige-high-fields', 'Prestige High Fields'], ['my_home_bhooja', 'My Home Bhooja']]);
  });
  it('preserves revision and the config timestamp', () => {
    const r = parsed();
    expect(r.config_revision).toBe('test-pricing-v1');
    expect(r.last_updated_at).toBe('2026-11-25T07:00:00Z');
  });
  it('shows all six flat sizes including 4BHK Premium, in server order', () => {
    expect(draftFlatGroups(parsed().communities[0]?.draft_maid).map(g => g.flat_size))
      .toEqual(['2BHK', '2.5BHK', '3BHK', '3.5BHK', '4BHK', '4BHK_PREMIUM']);
  });
  it('keeps each community’s own prices separate', () => {
    const [phf, bhooja] = parsed().communities;
    const floor3 = (c: typeof phf) => c?.draft_maid?.find(r => r.flat_size === '3BHK' && r.task === 'floor_cleaning')?.price_inr;
    expect(floor3(phf)).toBe(99);
    expect(floor3(bhooja)).toBe(129);
    expect(bhooja?.services.find(s => s.service_key === 'bathroom_cleaning')).toMatchObject({ unit_price_inr: 159, glass_partition_price_inr: 30 });
  });
  it('keeps positive and negative slot adjustments, and none where Admin sent none', () => {
    const [phf, bhooja] = parsed().communities;
    expect(phf?.slots.map(s => [s.slot_time, s.adjustment_inr])).toEqual([['08:00:00', 20], ['11:00:00', -10]]);
    expect(bhooja?.slots).toEqual([]);
  });
  it('keeps the four loyalty tiers separate from earnings examples', () => {
    const c = parsed().communities[0];
    expect(c?.loyalty.admin_tiers.map(t => t.surcharge_inr)).toEqual([0, 10, 15, 20]);
    expect(c?.loyalty.admin_tiers[3]?.max_completed).toBeNull();
    expect(c?.loyalty.personalised_amount_inr).toBeNull();
  });
  it('with 0% commission the estimate equals the full price', () => {
    expect(pricingExample(99, 29, 20, parsed().communities[0]?.commission.percent ?? NaN)).toEqual({ total: 148, fee: 0, estimate: 148 });
  });
  it('a negative slot lowers the total before the fee', () => {
    expect(pricingExample(89, 0, -10, 0)).toEqual({ total: 79, fee: 0, estimate: 79 });
  });
  it('a configured commission is floored once on the whole total (hosted rule), never a fixed 20%', () => {
    const f = servicePricingDraftFixture(); f.communities[0]!.commission_percent = 7.5;
    const pct = parseServicePricingDraft(f).communities[0]!.commission.percent;
    expect(pct).toBe(7.5);
    expect(pricingExample(99, 19, 20, pct)).toEqual({ total: 138, fee: 10, estimate: 128 });
    expect(pricingExample(99, 19, 20, pct)?.estimate).not.toBe(Math.round(138 * 0.8));
  });
  it('accepts an empty community list safely', () =>
    expect(parseServicePricingDraft({ ...servicePricingDraftFixture(), communities: [] }).communities).toEqual([]));
  it('rejects an unknown version and a missing price', () => {
    expect(() => parseServicePricingDraft({ ...servicePricingDraftFixture(), version: 'worker-service-pricing-v2' })).toThrow();
    const f = servicePricingDraftFixture(); Reflect.deleteProperty(f.communities[0]!.maid[0]!, 'price_inr');
    expect(() => parseServicePricingDraft(f)).toThrow();
  });
  it('refuses duplicate communities (case-insensitive) and duplicate task rows', () => {
    const f = servicePricingDraftFixture(); f.communities.push({ ...f.communities[0]!, community: 'PRESTIGE-HIGH-FIELDS' });
    expect(() => parseServicePricingDraft(f)).toThrow('ambiguous_communities');
    const g = servicePricingDraftFixture(); g.communities[0]!.maid.push({ ...g.communities[0]!.maid[0]! });
    expect(() => parseServicePricingDraft(g)).toThrow('ambiguous_rates');
  });
  it('refuses overlapping loyalty tiers', () => {
    const f = servicePricingDraftFixture(); f.loyalty_tiers[1]!.min_completed = 3;
    expect(() => parseServicePricingDraft(f)).toThrow('invalid_tier');
  });
  it('refuses invalid totals rather than inventing a zero earning', () => {
    expect(pricingExample(10, 0, -11, 0)).toBeNull();
    expect(pricingExample(99, 19, 0, NaN)).toBeNull();
  });
});
