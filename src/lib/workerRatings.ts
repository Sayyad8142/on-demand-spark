import { supabase } from '@/integrations/supabase/client';

export type RatingSummary = { average: number; count: number };
export type WorkerReview = {
  id: string; booking_id: string; worker_id: string; rating: number;
  comment: string | null; created_at: string;
  bookings: { status: string; cust_name: string; service_type: string; flat_no: string; community: string };
};

export function parseRatingSummary(row: { rating: unknown; total_ratings: unknown }): RatingSummary {
  const average = Number(row.rating);
  const count = Number(row.total_ratings);
  if (!Number.isInteger(count) || count < 0 || !Number.isFinite(average) || average < 0 || average > 5) {
    throw new Error('Invalid rating summary');
  }
  // A new worker retains the existing five-star default, with zero customer ratings.
  return { average: count === 0 ? 5 : average, count };
}

/** Server-maintained customer average, never an admin ranking override. */
export async function fetchRatingSummary(workerId: string): Promise<RatingSummary> {
  const { data, error } = await supabase.from('workers')
    .select('rating,total_ratings').eq('id', workerId).single();
  if (error) throw error;
  if (!data) throw new Error('Rating summary unavailable');
  return parseRatingSummary(data);
}

export async function collectCompletedReviews(
  workerId: string,
  fetchPage: (from: number, to: number) => Promise<{ data: WorkerReview[] | null; error: unknown }>,
  pageSize = 200,
): Promise<WorkerReview[]> {
  const reviews = new Map<string, WorkerReview>();
  for (let page = 0; page < 1000; page++) {
    const { data, error } = await fetchPage(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      if (row.worker_id === workerId && row.bookings?.status === 'completed' && row.rating >= 1 && row.rating <= 5) {
        reviews.set(row.id, row);
      }
    }
    if (rows.length < pageSize) return [...reviews.values()];
  }
  // Never present a silently truncated list as all reviews.
  throw new Error('Review pagination limit exceeded');
}

export function fetchCompletedReviews(workerId: string): Promise<WorkerReview[]> {
  return collectCompletedReviews(workerId, async (from, to) => {
    const { data, error } = await supabase.from('worker_ratings')
      .select('id,booking_id,worker_id,rating,comment,created_at,bookings!inner(status,cust_name,service_type,flat_no,community)')
      .eq('worker_id', workerId).eq('bookings.status', 'completed')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to);
    return { data: data as WorkerReview[] | null, error };
  });
}

export function reviewBreakdown(reviews: Pick<WorkerReview, 'rating'>[]) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const review of reviews) {
    if (Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5) counts[review.rating as keyof typeof counts]++;
  }
  return counts;
}