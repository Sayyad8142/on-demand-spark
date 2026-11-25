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

/** Keep only valid server rows for this worker; unknown tags are dropped, never guessed. */
export function parseBookingRatings(rows: unknown, workerId: string): Map<string, BookingRating> {
  const map = new Map<string, BookingRating>();
  if (!Array.isArray(rows)) return map;
  for (const row of rows as Record<string, unknown>[]) {
    const rating = Number(row?.rating);
    if (typeof row?.booking_id !== 'string' || row.worker_id !== workerId) continue;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) continue;
    const tags = Array.isArray(row.feedback_tags)
      ? (row.feedback_tags as unknown[]).filter((t): t is RatingTag => RATING_TAGS.includes(t as RatingTag))
      : [];
    map.set(row.booking_id, { rating, tags });
  }
  return map;
}

/** Reads ratings for this worker's own completed bookings. Throws on load failure so callers can tell it apart from "not rated". */
export async function fetchBookingRatings(workerId: string, bookingIds: string[]): Promise<Map<string, BookingRating>> {
  if (!bookingIds.length) return new Map();
  const { data, error } = await supabase.from('worker_ratings')
    .select('booking_id,worker_id,rating,feedback_tags')
    .eq('worker_id', workerId)
    .in('booking_id', bookingIds);
  if (error) throw error;
  return parseBookingRatings(data, workerId);
}
