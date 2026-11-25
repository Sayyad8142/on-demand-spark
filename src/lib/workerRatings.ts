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

/** Customer average from get_my_customer_rating_summary (session-scoped), never an admin ranking override. */
export async function fetchRatingSummary(_workerId: string): Promise<RatingSummary> {
  const { data, error } = await supabase.rpc('get_my_customer_rating_summary' as never);
  if (error) throw error;
  const row: unknown = Array.isArray(data) ? (data as unknown[])[0] : data;
  if (!row) throw new Error('Rating summary unavailable');
  const r = row as { avg_rating: unknown; ratings_count: unknown };
  return parseRatingSummary({ rating: r.avg_rating ?? 0, total_ratings: r.ratings_count });
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

type ReviewRow = { id: string; booking_id: string; rating: number; comment: string | null; feedback_tags: string[] | null; created_at: string };
type ReviewBooking = WorkerReview['bookings'] & { id: string; worker_id: string };

/** Pure join of session-scoped review rows with the worker's own completed bookings. Rows without a matching completed own booking are dropped. */
export function joinReviews(workerId: string, rows: unknown, bookings: ReviewBooking[]): WorkerReview[] {
  if (!Array.isArray(rows)) throw new Error('Invalid reviews response');
  const byId = new Map(bookings.map(b => [b.id, b]));
  const out: WorkerReview[] = [];
  const seen = new Set<string>();
  for (const r of rows as ReviewRow[]) {
    const rating = Number(r?.rating);
    const b = byId.get(r?.booking_id);
    if (!r?.id || seen.has(r.id) || !Number.isInteger(rating) || rating < 1 || rating > 5) continue;
    if (!b || b.status !== 'completed' || b.worker_id !== workerId) continue;
    seen.add(r.id);
    const { id: _id, worker_id: _w, ...details } = b;
    out.push({ id: r.id, booking_id: r.booking_id, worker_id: workerId, rating, comment: r.comment ?? null, created_at: r.created_at, bookings: details });
  }
  return out;
}

/** All reviews from get_my_customer_reviews (session-scoped, newest first); booking details come only from this worker's own bookings. */
export async function fetchCompletedReviews(workerId: string): Promise<WorkerReview[]> {
  const { data, error } = await supabase.rpc('get_my_customer_reviews' as never);
  if (error) throw error;
  const rows = Array.isArray(data) ? (data as ReviewRow[]) : [];
  const ids = [...new Set(rows.map(r => r.booking_id).filter(Boolean))];
  const bookings: ReviewBooking[] = [];
  for (let k = 0; k < ids.length; k += 200) {
    const { data: b, error: be } = await supabase.from('bookings')
      .select('id,worker_id,status,cust_name,service_type,flat_no,community')
      .eq('worker_id', workerId).in('id', ids.slice(k, k + 200));
    if (be) throw be;
    bookings.push(...((b ?? []) as unknown as ReviewBooking[]));
  }
  return joinReviews(workerId, data, bookings);
}

export function reviewBreakdown(reviews: Pick<WorkerReview, 'rating'>[]) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const review of reviews) {
    if (Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5) counts[review.rating as keyof typeof counts]++;
  }
  return counts;
}