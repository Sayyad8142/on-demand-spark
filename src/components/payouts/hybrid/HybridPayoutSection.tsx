/**
 * Hybrid payout section for the Earnings screen (contract v1).
 * Renders nothing when HYBRID_PAYOUT_UI_ENABLED is off or any call/validation
 * fails, so the existing payout screens keep working unchanged.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import { HYBRID_PAYOUT_UI_ENABLED } from "@/lib/hybridPayout";
import {
  createHybridPayoutClient, historyToConsolidated, historyToManual, summaryToDailyView, summaryToInstantView,
  type HybridPayoutClient, type PayoutDetail, type PayoutHistoryItem, type PayoutSummary,
} from "@/lib/hybridPayoutApi";
import { ConsolidatedPayoutItem, DailyPayoutSchedule, InstantPayoutProgress, ManualPayoutConfirmation, PendingEarningsCard } from "./HybridPayoutCards";

export function HybridPayoutSection({ client, enabled = HYBRID_PAYOUT_UI_ENABLED }: { client?: HybridPayoutClient; enabled?: boolean }) {
  useWorkerLanguage();
  const [api] = useState(() => client ?? createHybridPayoutClient(undefined, enabled));
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [items, setItems] = useState<PayoutHistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, PayoutDetail>>({});
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    Promise.all([api.getSummary(), api.getHistory(null)])
      .then(([s, h]) => { if (!cancelled) { setSummary(s); setItems(h.items); setCursor(h.nextCursor); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [api, enabled]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const h = await api.getHistory(cursor);
      setItems((prev) => [...prev, ...h.items.filter((i) => !prev.some((p) => p.payoutId === i.payoutId))]);
      setCursor(h.nextCursor);
    } catch { setCursor(null); } finally { setLoadingMore(false); }
  }, [api, cursor]);

  const openDetail = useCallback((id: string) => {
    if (details[id]) return;
    api.getDetail(id).then((d) => setDetails((m) => ({ ...m, [id]: d }))).catch(() => undefined);
  }, [api, details]);

  if (!enabled || failed || !summary) return null;
  const t = summary.totalsInr;
  return (
    <section className="space-y-3" data-testid="hybrid-payouts">
      {summary.payoutMode === "instant"
        ? <InstantPayoutProgress {...summaryToInstantView(summary)} />
        : <DailyPayoutSchedule {...summaryToDailyView(summary)} />}
      {summary.payoutMode === "instant" && summary.nextSettlement && <DailyPayoutSchedule {...summaryToDailyView(summary)} />}
      {!summary.bankPayoutsActive && (
        <p className="text-xs text-muted-foreground" data-testid="manual-mode-note">
          {displayText("Payouts are being sent manually by Didi Now. Your earnings are recorded.")}
        </p>
      )}
      <PendingEarningsCard today={summary.today.earnedInr} awaiting={t.awaiting_payout + t.prepared} processing={t.processing} paid={t.paid} />
      <div className="space-y-2">
        {items.map((h) => {
          const manual = historyToManual(h);
          return manual
            ? <ManualPayoutConfirmation key={h.payoutId} {...manual} />
            : <ConsolidatedPayoutItem key={h.payoutId} payout={historyToConsolidated(h, details[h.payoutId])} onOpen={() => openDetail(h.payoutId)} />;
        })}
      </div>
      {cursor && (
        <Button variant="outline" className="w-full" disabled={loadingMore} onClick={loadMore}>{displayText("Show more")}</Button>
      )}
    </section>
  );
}
