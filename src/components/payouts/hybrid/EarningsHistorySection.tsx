/**
 * New-programme earnings, read only from the Admin `get_my_earnings` RPC
 * (opaque cursor, server labels). Renders nothing on failure or when empty;
 * never calculates amounts or statuses.
 */
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { displayLocale, displayText, useWorkerLanguage } from "@/i18n/display";
import { createHybridPayoutClient, type HybridPayoutClient } from "@/lib/hybridPayoutApi";

const liveClient = createHybridPayoutClient(undefined, true);
const istDate = (iso: string) => new Date(iso).toLocaleString(displayLocale(), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export function EarningsHistorySection({ accountId, client = liveClient }: { accountId: string; client?: HybridPayoutClient }) {
  useWorkerLanguage();
  const q = useInfiniteQuery({
    queryKey: ["imps-earnings", accountId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => client.getEarnings(null, pageParam),
    getNextPageParam: (last, _pages, lastCursor, cursors) =>
      last.nextCursor && last.nextCursor !== lastCursor && !cursors.includes(last.nextCursor) ? last.nextCursor : undefined,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  const unique = rows.filter((r, i) => rows.findIndex((o) => o.earningId === r.earningId) === i);
  if (q.isError || unique.length === 0) return null;
  return (
    <section className="space-y-2" data-testid="earnings-history">
      <h2 className="font-semibold">{displayText("Earnings history")}</h2>
      {unique.map((e) => (
        <Card key={e.earningId} className="p-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{istDate(e.completedAt)}</p>
            <p className="text-xs text-muted-foreground">{e.statusLabel}</p>
            {e.expectedSettlementDateIst && !e.payoutId && (
              <p className="text-xs text-muted-foreground">{displayText("Expected payout date")}: {e.expectedSettlementDateIst}</p>
            )}
          </div>
          <span className="font-bold shrink-0">₹{e.earningInr}</span>
        </Card>
      ))}
      {q.hasNextPage && (
        <Button variant="outline" className="w-full" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>{displayText("Show more")}</Button>
      )}
    </section>
  );
}
