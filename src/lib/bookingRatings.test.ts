import { describe, it, expect } from 'vitest';
import { parseBookingRatings } from './bookingRatings';

const W = 'w1';
describe('parseBookingRatings', () => {
  it('keeps a real 3-star rating with its feedback tags', () => {
    const m = parseBookingRatings([{ booking_id: 'b1', worker_id: W, rating: 3, feedback_tags: ['arrived_late', 'behaviour'] }], W);
    expect(m.get('b1')).toEqual({ rating: 3, tags: ['arrived_late', 'behaviour'] });
  });
  it('ignores ratings belonging to another worker', () => {
    expect(parseBookingRatings([{ booking_id: 'b1', worker_id: 'other', rating: 5 }], W).size).toBe(0);
  });
  it('ignores out-of-range ratings and unknown tags', () => {
    const m = parseBookingRatings([
      { booking_id: 'b1', worker_id: W, rating: 0 },
      { booking_id: 'b2', worker_id: W, rating: 2, feedback_tags: ['made_up', 'other'] },
    ], W);
    expect(m.has('b1')).toBe(false);
    expect(m.get('b2')?.tags).toEqual(['other']);
  });
});
