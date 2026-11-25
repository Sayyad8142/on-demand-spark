import { supabase } from '@/integrations/supabase/client';

/** Customer feedback tags accepted by the server's rating_feedback_validate trigger. */
export const RATING_TAGS = ['cleaning_quality', 'arrived_late', 'behaviour', 'work_incomplete', 'other'] as const;
export type RatingTag = typeof RATING_TAGS[number];

export const RATING_TAG_LABELS: Record<RatingTag, string> = {
  cleaning_quality: 'Cleaning quality',
  arrived_late: 'Arrived late',
  behaviour: 'Behaviour',
  work_incomplete: 'Work incomplete',
  other: 'Other',
};

export type BookingRating = { rating: number; tags: RatingTag[] };

/** Keep only valid server rows; unknown tags are dropped, never guessed. The server scopes rows to the signed-in worker. */
export function parseBookingRatings(rows: unknown): Map<string, BookingRating> {
  const map = new Map<string, BookingRating>();
  if (!Array.isArray(rows)) return map;
  for (const row of rows as Record<string, unknown>[]) {
    const rating = Number(row?.rating);
    if (typeof row?.booking_id !== 'string') continue;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) continue;
    const tags = Array.isArray(row.feedback_tags)
      ? (row.feedback_tags as unknown[]).filter((t): t is RatingTag => RATING_TAGS.includes(t as RatingTag))
      : [];
    if (!map.has(row.booking_id)) map.set(row.booking_id, { rating, tags }); // newest first from server
  }
  return map;
}

/** Reads the signed-in worker's own ratings via get_my_customer_reviews (worker identity comes from the session). Throws on failure so callers can tell it apart from "not rated". */
export async function fetchBookingRatings(_workerId: string, bookingIds: string[]): Promise<Map<string, BookingRating>> {
  if (!bookingIds.length) return new Map();
  const { data, error } = await supabase.rpc('get_my_customer_reviews' as never);
  if (error) throw error;
  const wanted = new Set(bookingIds);
  const all = parseBookingRatings(data);
  return new Map([...all].filter(([id]) => wanted.has(id)));
}
