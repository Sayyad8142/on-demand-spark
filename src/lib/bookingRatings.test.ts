import { describe, it, expect } from 'vitest';
import { parseBookingRatings } from './bookingRatings';

describe('parseBookingRatings', () => {
  it('keeps a real 3-star rating with its feedback tags', () => {
    const m = parseBookingRatings([{ booking_id: 'b1', rating: 3, feedback_tags: ['arrived_late', 'behaviour'] }]);
    expect(m.get('b1')).toEqual({ rating: 3, tags: ['arrived_late', 'behaviour'] });
  });
  it('ignores out-of-range ratings and unknown tags', () => {
    const m = parseBookingRatings([
      { booking_id: 'b1', rating: 0 },
      { booking_id: 'b2', rating: 2, feedback_tags: ['made_up', 'other'] },
    ]);
    expect(m.has('b1')).toBe(false);
    expect(m.get('b2')?.tags).toEqual(['other']);
  });
});
