import { describe, expect, it } from 'vitest';
import { parsePricingCatalogue, pricingCommunity, pricingSnapshotFresh, SERVICE_PRICING_ENABLED } from '../servicePricing';
import { pricingFixture } from './servicePricingFixture';

describe('Prepared service pricing contract', () => {
  it('keeps production pricing disabled', () => expect(SERVICE_PRICING_ENABLED).toBe(false));
  it('preserves server combined discount instead of summing task prices', () => {
    const service = parsePricingCatalogue(pricingFixture()).communities[0]?.services[0];
    expect(service?.service_key).toBe('maid');
    if (service?.service_key !== 'maid') throw new Error('maid missing');
    expect(service.flat_sizes[0]?.combined_light_inr).toBe(197);
    expect(service.flat_sizes[0]?.combined_discount_inr).toBe(7);
  });
  it('preserves configured zero glass and negative slots', () => {
    const community = parsePricingCatalogue(pricingFixture()).communities[0];
    const service = community?.services[1];
    expect(service?.service_key).toBe('bathroom_cleaning');
    if (service?.service_key !== 'bathroom_cleaning') throw new Error('bathroom missing');
    expect(service.glass_partition_price_inr).toBe(0);
    expect(community?.slots[0]?.adjustment_inr).toBe(-13);
    expect(community?.commission.percent).toBe(7);
  });
  it('does not substitute another community', () => expect(pricingCommunity(parsePricingCatalogue(pricingFixture()), 'other')).toBeNull());
  it('accepts empty assignments without a global fallback', () => {
    const fixture = pricingFixture(); fixture.communities = [];
    expect(parsePricingCatalogue(fixture).communities).toEqual([]);
  });
  it.each(['schema_version', 'currency', 'time_zone'])('rejects invalid %s', field => {
    expect(() => parsePricingCatalogue({ ...pricingFixture(), [field]: 'invalid' })).toThrow();
  });
  it('rejects duplicate communities', () => {
    const fixture = pricingFixture(); fixture.communities.push(...fixture.communities);
    expect(() => parsePricingCatalogue(fixture)).toThrow('ambiguous_communities');
  });
  it('rejects incomplete workloads rather than using defaults', () => {
    const fixture = pricingFixture(); fixture.communities[0]?.services[0]?.dish_workloads?.pop();
    expect(() => parsePricingCatalogue(fixture)).toThrow();
  });
  it('rejects unsupported service types rather than presenting leftover rows', () => {
    const fixture = pricingFixture(); const service = fixture.communities[0]?.services[0];
    if (service) service.service_key = 'cook';
    expect(() => parsePricingCatalogue(fixture)).toThrow();
  });
  it('marks old, malformed and future snapshots as not live', () => {
    const now = Date.parse('2026-11-24T16:00:00Z');
    expect(pricingSnapshotFresh('2026-11-24T15:55:00Z', now)).toBe(true);
    expect(pricingSnapshotFresh('2026-11-24T15:54:59Z', now)).toBe(false);
    expect(pricingSnapshotFresh('2026-11-24T16:00:01Z', now)).toBe(false);
    expect(pricingSnapshotFresh('invalid', now)).toBe(false);
  });
});