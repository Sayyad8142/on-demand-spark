/**
 * First-ten IMPS progress, daily payout schedule and pending earnings — read
 * only from the Admin `get_my_payout_summary()` RPC. Renders nothing on any
 * failure or malformed response; never calculates counts or amounts.
 */
import { useQuery } from "@tanstack/react-query";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import { Card } from "@/components/ui/card";
import { createHybridPayoutClient, summaryToDailyView, summaryToInstantView, type HybridPayoutClient } from "@/lib/hybridPayoutApi";
import { DailyPayoutSchedule, InstantPayoutProgress } from "./HybridPayoutCards";

const liveClient = createHybridPayoutClient(undefined, true);

export function PayoutProgrammeSummary({ accountId, client = liveClient }: { accountId: string; client?: HybridPayoutClient }) {
  useWorkerLanguage();
  const { data: summary } = useQuery({
    queryKey: ["payout-programme-summary", accountId],
    queryFn: () => client.getSummary(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });
  if (!summary) return null;
  const daily = summaryToDailyView(summary);
  return (
    <section className="space-y-3" data-testid="payout-programme-summary">
      {summary.payoutMode === "instant"
        ? <InstantPayoutProgress {...summaryToInstantView(summary)} />
        : <DailyPayoutSchedule {...daily} />}
      {summary.payoutMode === "instant" && summary.nextSettlement && daily.settlementAmount ? <DailyPayoutSchedule {...daily} /> : null}
      {summary.pendingEarningsInr !== null && (
        <Card className="p-3 flex items-center justify-between" data-testid="pending-earnings-total">
          <span className="text-sm text-muted-foreground">{displayText("Pending earnings")}</span>
          <span className="text-lg font-bold">₹{summary.pendingEarningsInr}</span>
        </Card>
      )}
      {!summary.bankPayoutsActive && (
        <p className="text-xs text-muted-foreground" data-testid="manual-mode-note">
          {displayText("Payouts are being sent manually by Didi Now. Your earnings are recorded.")}
        </p>
      )}
    </section>
  );
}
