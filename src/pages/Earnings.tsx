import { displayText, useWorkerLanguage, displayLocale } from "@/i18n/display";
import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Wallet, Clock, IndianRupee, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { resolvePayoutBreakdown } from "@/lib/payoutCalc";
import { useWorkerPayouts } from "@/hooks/useWorkerPayouts";
import { computePayoutTotals, mapPayoutStatus, payoutReference, isManualPayout, type PayoutRecord } from "@/lib/payoutDisplay";
import { PayoutStatusBadge } from "@/components/payouts/PayoutStatusBadge";
import { PayoutLoadError } from "@/components/payouts/PayoutLoadError";

const HISTORY_PAGE = 20;

interface HistoryRow extends PayoutRecord {
  /** Completed booking without a payout record yet — amount is an estimate. */
  isEstimate?: boolean;
}

interface CompletedBooking { id: string; price_inr: number | null; community: string | null; completed_at: string | null; created_at: string }

async function fetchCompletedBookings(workerId: string): Promise<CompletedBooking[]> {
  const out: CompletedBooking[] = [];
  for (let page = 0; page < 50; page++) {
    const from = page * 1000;
    const { data, error } = await supabase
      .from("bookings")
      .select("id, price_inr, community, completed_at, created_at")
      .eq("worker_id", workerId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    out.push(...((data as CompletedBooking[]) ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default function Earnings() {
  useWorkerLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [workerUpi, setWorkerUpi] = useState<string | null>(null);
  const [workerResolved, setWorkerResolved] = useState(false);
  const [estimates, setEstimates] = useState<HistoryRow[]>([]);
  const [visible, setVisible] = useState(HISTORY_PAGE);
  const [recentlyPaidIds, setRecentlyPaidIds] = useState<Set<string>>(new Set());
  const notifiedIds = useRef<Set<string>>(new Set());
  const ready = useRef(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: w } = await supabase.from("workers").select("id, upi_id").eq("user_id", user.id).maybeSingle();
      const row = w ?? (await supabase.from("workers").select("id, upi_id").eq("id", user.id).maybeSingle()).data;
      if (row) { setWorkerId(row.id); setWorkerUpi(row.upi_id); }
      setWorkerResolved(true);
    })();
  }, [user]);

  const { payouts, loading, error, lastUpdated, refresh } = useWorkerPayouts(workerId, (row) => {
    if (!ready.current || !row?.id) return;
    if (mapPayoutStatus(row.status, row.paid_at) === "paid" && !notifiedIds.current.has(row.id)) {
      notifiedIds.current.add(row.id);
      const id = row.id;
      setRecentlyPaidIds((prev) => new Set(prev).add(id));
      toast.success(displayText("₹{{amount}} payout confirmed as paid", { amount: Number(row.payout_amount) || 0 }));
      setTimeout(() => setRecentlyPaidIds((prev) => { const n = new Set(prev); n.delete(id); return n; }), 30000);
    }
  });

  useEffect(() => { if (!loading) ready.current = true; }, [loading]);

  // Completed bookings that have no payout record yet → clearly-labelled estimates.
  useEffect(() => {
    if (!workerId || loading) return;
    let cancelled = false;
    (async () => {
      try {
        const completed = await fetchCompletedBookings(workerId);
        const have = new Set(payouts.map((p) => p.booking_id));
        const missing = completed.filter((b) => !have.has(b.id) && b.price_inr != null);
        const br = await Promise.all(missing.map((b) => resolvePayoutBreakdown(Number(b.price_inr) || 0, b.community)));
        if (cancelled) return;
        setEstimates(missing.map((b, i) => ({
          id: `estimate-${b.id}`, booking_id: b.id,
          gross_amount: br[i].gross, platform_fee: br[i].feeAmount, payout_amount: br[i].netPayout,
          status: "estimating", payout_method: null, payout_source: null, failure_reason: null, paid_at: null,
          created_at: b.completed_at || b.created_at, external_reference: null, reference_id: null, manual_utr: null,
          isEstimate: true,
        })));
      } catch {
        // Estimates are optional; payout records still display.
      }
    })();
    return () => { cancelled = true; };
  }, [workerId, payouts, loading]);

  const history: HistoryRow[] = useMemo(
    () => [...payouts, ...estimates].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [payouts, estimates],
  );
  const totals = useMemo(() => computePayoutTotals(history), [history]);
  const hasUpi = !!workerUpi && workerUpi.includes("@");
  const initialLoading = !workerResolved || (workerId != null && loading && payouts.length === 0 && !error);

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">{displayText("Earnings")}</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {error && <PayoutLoadError onRetry={refresh} hasData={payouts.length > 0} />}

        {!hasUpi && (
          <Card className="border-2 border-warning/40 bg-warning/10">
            <CardContent className="p-3 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-warning flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{displayText("UPI not set up")}</p>
                <p className="text-xs text-muted-foreground">{displayText("Add your UPI ID so payouts can be sent to you")}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate("/profile")}>{displayText("Add UPI")}</Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-3 gap-3">
          <SummaryCard label={displayText("Today")} amount={totals.today} icon={IndianRupee} />
          <SummaryCard label={displayText("This Week")} amount={totals.week} icon={TrendingUp} />
          <SummaryCard label={displayText("Total Earned")} amount={totals.total} icon={Wallet} />
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <StateTotal label={displayText("Awaiting payout")} amount={totals.awaiting + totals.earnedNotRecorded + totals.onHold} icon={Clock} cls="text-warning" />
          <StateTotal label={displayText("Processing")} amount={totals.processing} icon={Loader2} cls="text-primary" />
          <StateTotal label={displayText("Paid")} amount={totals.paid} icon={CheckCircle2} cls="text-success" />
        </div>
        {lastUpdated && (
          <p className="text-[11px] text-muted-foreground text-center">
            {displayText("Updated")} {lastUpdated.toLocaleTimeString(displayLocale(), { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
          </p>
        )}

        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">{displayText("Booking Earnings")}</h2>
          {history.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="font-medium text-muted-foreground">{displayText("No earnings yet")}</p>
                <p className="text-xs text-muted-foreground mt-1">{displayText("Complete bookings to start earning")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {history.slice(0, visible).map((p) => (
                <PayoutRow key={p.id} p={p} justPaid={recentlyPaidIds.has(p.id)} onFixUpi={() => navigate("/profile")} />
              ))}
              {history.length > visible && (
                <Button variant="outline" className="w-full" onClick={() => setVisible((v) => v + HISTORY_PAGE)}>
                  {displayText("Show more")}
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="h-8" />
      </main>
    </div>
  );
}

function PayoutRow({ p, justPaid, onFixUpi }: { p: HistoryRow; justPaid: boolean; onFixUpi: () => void }) {
  useWorkerLanguage();
  const state = p.isEstimate ? "earned" : mapPayoutStatus(p.status, p.paid_at);
  const ref = payoutReference(p);
  const isFailed = state === "failed" || state === "reversed";
  return (
    <Card className={`border shadow-sm transition-all duration-500 ${justPaid ? "ring-2 ring-success bg-success/5" : ""}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-mono">#{p.booking_id.slice(0, 8)}</span>
          <div className="flex items-center gap-1.5">
            {justPaid && <Badge className="bg-success text-success-foreground text-[10px] px-1.5 py-0 animate-pulse">{displayText("Just Paid")}</Badge>}
            <PayoutStatusBadge state={state} />
          </div>
        </div>
        <div className="text-sm">
          <p className="text-xs text-muted-foreground">{displayText("You Earn")}</p>
          <p className="text-xl font-bold text-success">{p.isEstimate ? "~" : ""}₹{Number(p.payout_amount) || 0}</p>
        </div>
        {p.isEstimate && (
          <p className="text-[11px] text-muted-foreground italic">{displayText("Estimated payout. Will update once processed.")}</p>
        )}
        {state === "paid" && p.paid_at && (
          <p className="text-xs text-muted-foreground">
            {displayText("Paid on")} {new Date(p.paid_at).toLocaleString(displayLocale(), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
            {isManualPayout(p) ? ` · ${displayText("Paid by Didi Now team")}` : ""}
          </p>
        )}
        {ref && <p className="text-xs text-muted-foreground">{displayText("Reference No.")} {ref}</p>}
        {isFailed && p.failure_reason && <p className="text-xs text-destructive">{displayText("Reason:")} {p.failure_reason}</p>}
        {isFailed && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={onFixUpi}>{displayText("Update UPI")}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, amount, icon: Icon }: { label: string; amount: number; icon: typeof Clock }) {
  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <CardContent className="p-3 bg-primary text-primary-foreground">
        <Icon className="w-5 h-5 mb-1 opacity-80" />
        <p className="text-lg font-bold">₹{amount}</p>
        <p className="text-[10px] font-medium opacity-80 uppercase tracking-wide">{label}</p>
      </CardContent>
    </Card>
  );
}

function StateTotal({ label, amount, icon: Icon, cls }: { label: string; amount: number; icon: typeof Clock; cls: string }) {
  return (
    <Card className="p-2.5">
      <Icon className={`w-4 h-4 mx-auto mb-1 ${cls}`} />
      <p className={`text-base font-bold ${cls}`}>₹{amount}</p>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
    </Card>
  );
}
