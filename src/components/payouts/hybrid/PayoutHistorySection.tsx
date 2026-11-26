import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import { createHybridPayoutClient, historyToConsolidated, type PayoutHistoryItem } from "@/lib/hybridPayoutApi";
import { ConsolidatedPayoutItem } from "./HybridPayoutCards";

// Only history/detail are activated. The allocation-based summary remains OFF.
const api = createHybridPayoutClient(undefined, true);
export function PayoutHistorySection({ accountId }: { accountId: string }) {
  useWorkerLanguage();
  const client = useQueryClient();
  const key = ["imps-payout-history", accountId];
  const history = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.getHistory(pageParam),
    getNextPageParam: (last, pages, lastCursor, cursors) =>
      last.nextCursor && last.nextCursor !== lastCursor && !cursors.includes(last.nextCursor) ? last.nextCursor : undefined,
    staleTime: 0,
    gcTime: 0,
  });
  useEffect(() => {
    const refresh = () => { void client.invalidateQueries({ queryKey: ["imps-payout-history", accountId] }); void client.invalidateQueries({ queryKey: ["imps-payout-detail", accountId] }); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    const channel = supabase.channel(`payout-history-${accountId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "worker_payouts" }, refresh).subscribe();
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", visible); void supabase.removeChannel(channel); };
  }, [accountId, client]);
  const rows = history.data?.pages.flatMap(page => page.items) ?? [];
  const unique = rows.filter((row, index) => rows.findIndex(other => other.payoutId === row.payoutId) === index);
  return <section className="space-y-3">
    <div className="flex items-center justify-between"><h2 className="font-semibold">{displayText("Payout history")}</h2><Button size="icon" variant="ghost" aria-label={displayText("Refresh")} title={displayText("Refresh")} disabled={history.isFetching} onClick={() => void history.refetch()}><RefreshCw className="h-4 w-4" /></Button></div>
    {history.isPending && <p className="text-sm text-muted-foreground">{displayText("Loading...")}</p>}
    {history.isError && <p role="alert" className="text-sm text-destructive">{displayText("Couldn't load your payouts. Please try again.")}</p>}
    {unique.map(item => <HistoryEntry key={item.payoutId} accountId={accountId} item={item} />)}
    {history.hasNextPage && <Button variant="outline" className="w-full" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>{displayText("Show more")}</Button>}
  </section>;
}

function HistoryEntry({ item, accountId }: { item: PayoutHistoryItem; accountId: string }) {
  const [opened, setOpened] = useState(false);
  const detail = useQuery({ queryKey: ["imps-payout-detail", accountId, item.payoutId], queryFn: () => api.getDetail(item.payoutId), enabled: opened, staleTime: 0, gcTime: 0 });
  return <ConsolidatedPayoutItem payout={historyToConsolidated(item, detail.data)} onOpen={() => setOpened(true)} detailLoading={opened && detail.isPending} detailError={detail.isError} onRetry={() => void detail.refetch()} />;
}