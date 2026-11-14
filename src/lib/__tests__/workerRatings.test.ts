import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { collectCompletedReviews, parseRatingSummary, reviewBreakdown, type WorkerReview } from '../workerRatings';
const review = (id: string, status = 'completed', worker = 'w'): WorkerReview => ({
  id, booking_id: `b-${id}`, worker_id: worker, rating: 1, comment: 'Feedback', created_at: '2026-11-15',
  bookings: { status, cust_name: 'Customer', service_type: 'maid', flat_no: '1', community: 'c' },
});
describe('Customer rating display rules', () => {
  it('uses the server average and exact total, including one-star ratings', () => {
    expect(parseRatingSummary({ rating: '1.25', total_ratings: 1201 })).toEqual({ average: 1.25, count: 1201 });
  });
  it('retains five-star default only for zero customer ratings', () => {
    expect(parseRatingSummary({ rating: 0, total_ratings: 0 })).toEqual({ average: 5, count: 0 });
  });
  it('rejects invalid averages and counts instead of fabricating values', () => {
    expect(() => parseRatingSummary({ rating: 6, total_ratings: 1 })).toThrow();
    expect(() => parseRatingSummary({ rating: 4, total_ratings: -1 })).toThrow();
  });
  it('loads every page beyond the default 1000-row limit', async () => {
    const rows = Array.from({ length: 1201 }, (_, i) => review(String(i)));
    const fetch = vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));
    expect(await collectCompletedReviews('w', fetch)).toHaveLength(1201);
    expect(fetch).toHaveBeenCalledTimes(7);
    expect(fetch).toHaveBeenLastCalledWith(1200, 1399);
  });
  it('does not expose individual ratings until completed', async () => {
    const rows = ['started', 'assigned', 'accepted', 'cancelled', 'completed'].map((s, i) => review(String(i), s));
    expect((await collectCompletedReviews('w', async () => ({ data: rows, error: null }))).map(r => r.id)).toEqual(['4']);
  });
  it('never mixes another worker feedback into the list', async () => {
    const rows = [review('a'), review('b', 'completed', 'other')];
    expect((await collectCompletedReviews('w', async () => ({ data: rows, error: null }))).map(r => r.id)).toEqual(['a']);
  });
  it('fails the whole refresh on page failure rather than showing partial totals', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ data: [review('a')], error: null }).mockResolvedValueOnce({ data: null, error: Error('offline') });
    await expect(collectCompletedReviews('w', fetch, 1)).rejects.toThrow('offline');
  });
  it('breakdown counts completed feedback independently of the overall rating total', () => {
    expect(reviewBreakdown([{ rating: 1 }, { rating: 5 }, { rating: 5 }])).toEqual({ 1: 1, 2: 0, 3: 0, 4: 0, 5: 2 });
  });
});