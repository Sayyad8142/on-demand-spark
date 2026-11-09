import { supabase } from "@/integrations/supabase/client";
import { PAYOUT_COLUMNS, type PayoutRecord } from "./payoutDisplay";

export const PAYOUT_FETCH_PAGE = 1000;

type RangeFetcher = (from: number, to: number) => Promise<{ data: PayoutRecord[] | null; error: unknown }>;

/** Read every page so totals are never capped by the server's row limit. */
export async function fetchAllPages(fetchRange: RangeFetcher, pageSize = PAYOUT_FETCH_PAGE, maxPages = 50): Promise<PayoutRecord[]> {
  const all: PayoutRecord[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data, error } = await fetchRange(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

/** Read-only: all payout records for one worker, newest first. */
export function fetchAllWorkerPayouts(workerId: string): Promise<PayoutRecord[]> {
  return fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from("worker_payouts")
      .select(PAYOUT_COLUMNS)
      .eq("worker_id", workerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    return { data: (data as unknown as PayoutRecord[]) ?? null, error };
  });
}
