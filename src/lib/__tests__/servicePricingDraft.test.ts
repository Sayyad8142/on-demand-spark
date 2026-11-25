import { describe, expect, it } from 'vitest';
import { parseServicePricingDraft, pricingExample } from '../servicePricingDraft';
import { servicePricingDraftFixture } from './servicePricingDraftFixture';

describe('Draft worker-service-pricing-v1 preparation', () => {
  it('preserves revision, config timestamp and every server task estimate', () => {
    const result = parseServicePricingDraft(servicePricingDraftFixture());
    expect(result.config_revision).toBe('synthetic-draft');
    expect(result.last_updated_at).toBe('2026-11-25T07:00:00Z');
    expect(result.communities[0]?.draft_maid?.map(r => r.worker_estimate_inr)).toEqual([113, 78, 184]);
  });
  it('applies commission once to the full combined total including extras and negative slots', () => {
    expect(pricingExample(197, 17, -13, 7)).toEqual({ total: 201, fee: 14, estimate: 187 });
  });
  it('never adds individually rounded worker estimates', () => {
    expect(pricingExample(121 + 83, 0, 0, 7)?.estimate).toBe(190);
    expect(pricingExample(121 + 83, 0, 0, 7)?.estimate).not.toBe(113 + 78);
  });
  it('preserves zero configured commission without fixed 20 percent', () => expect(pricingExample(201, 0, 0, 0)?.estimate).toBe(201));
  it('preserves zero glass and both signs of slot adjustments', () => {
    const c = parseServicePricingDraft(servicePricingDraftFixture()).communities[0];
    expect(c?.slots.map(s => s.adjustment_inr)).toEqual([-13, 23]);
    expect(c?.services.find(s => s.service_key === 'bathroom_cleaning')).toMatchObject({ glass_partition_price_inr: 0 });
  });
  it('keeps loyalty separate from examples', () => {
    const c = parseServicePricingDraft(servicePricingDraftFixture()).communities[0];
    expect(c?.loyalty.personalised_amount_inr).toBeNull();
    expect(c?.loyalty.admin_tiers[0]?.surcharge_inr).toBe(19);
    expect(pricingExample(197, 0, 0, c?.commission.percent ?? NaN)?.estimate).toBe(184);
  });
  it('accepts empty communities safely', () => expect(parseServicePricingDraft({ ...servicePricingDraftFixture(), communities: [] }).communities).toEqual([]));
  it('rejects undeclared versions and missing prices', () => {
    expect(() => parseServicePricingDraft({ ...servicePricingDraftFixture(), schema_version: 'unknown' })).toThrow();
    const f = servicePricingDraftFixture(); Reflect.deleteProperty(f.communities[0]?.maid[0] ?? {}, 'price_inr');
    expect(() => parseServicePricingDraft(f)).toThrow();
  });
  it('refuses ambiguous community and task rows', () => {
    const f = servicePricingDraftFixture(); f.communities.push(...f.communities);
    expect(() => parseServicePricingDraft(f)).toThrow('ambiguous_communities');
    const other = servicePricingDraftFixture(); other.communities[0]?.maid.push(...other.communities[0].maid);
    expect(() => parseServicePricingDraft(other)).toThrow('ambiguous_rates');
  });
  it('refuses invalid totals rather than inventing a zero earning', () => {
    expect(pricingExample(10, 0, -11, 7)).toBeNull();
    expect(pricingExample(197, 17, 0, NaN)).toBeNull();
  });
});