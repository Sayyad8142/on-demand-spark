import { describe, it, expect } from 'vitest';
import { surgeBySlot, surgeServices, workerSurgeEstimate, surgeApplicability } from '@/lib/availabilitySurge';
import type { PricingCommunity } from '@/lib/servicePricing';

const comm = (slots: Array<[string, string, number]>, pct = 0, applyTo: string | null = 'scheduled') => ({
  id: 'phf', value: 'phf', name: 'Prestige High Fields', commission: { percent: pct },
  slots: slots.map(([service_key, slot_time, adjustment_inr]) => ({ service_key, slot_time, adjustment_inr })),
  live: { slotsApplyTo: applyTo, dish: [], glass: null, discrepancies: [] },
}) as unknown as PricingCommunity;

describe('availability surge', () => {
  const c = comm([['maid','07:00:00',10],['maid','07:15:00',10],['maid','09:00:00',0],['maid','11:00:00',-5],
    ['bathroom_cleaning','18:00:00',20],['bathroom_cleaning','19:00:00',20],['maid','06:30:00',40]]);
  it('positive and negative maid slots', () => {
    const m = surgeBySlot(c, 'maid');
    expect(m.get('07:00:00')).toBe(10);
    expect(m.get('11:00:00')).toBe(-5);
  });
  it('zero, missing, quarter-hour and out-of-hours show nothing', () => {
    const m = surgeBySlot(c, 'maid');
    expect(m.has('09:00:00')).toBe(false);
    expect(m.has('10:00:00')).toBe(false);
    expect(m.has('07:15:00')).toBe(false);
    expect(m.has('06:30:00')).toBe(false);
    expect(surgeBySlot(c, 'bathroom_cleaning').has('19:00:00')).toBe(false);
  });
  it('services are kept separate', () => {
    expect(surgeBySlot(c, 'bathroom_cleaning').get('18:00:00')).toBe(20);
    expect(surgeBySlot(c, 'bathroom_cleaning').has('07:00:00')).toBe(false);
    expect(surgeServices(c)).toEqual(['maid', 'bathroom_cleaning']);
  });
  it('applies community commission with floor on fee', () => {
    expect(workerSurgeEstimate(20, 15)).toBe(17);
    expect(workerSurgeEstimate(-10, 15)).toBe(-9);
    expect(surgeBySlot(comm([['maid','07:00:00',20]], 20), 'maid').get('07:00:00')).toBe(16);
  });
  it('unknown applicability hides everything', () => {
    expect(surgeApplicability('scheduled')).toEqual({ scheduled: true, instant: false });
    expect(surgeBySlot(comm([['maid','07:00:00',10]], 0, null), 'maid').size).toBe(0);
    expect(surgeServices(comm([['maid','07:00:00',10]], 0, 'weird'))).toEqual([]);
  });
});
