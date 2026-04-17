import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Wallet, CheckCircle2, XCircle, Clock, RefreshCw, IndianRupee, TrendingUp, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface PayoutRow {
  id: string;
  booking_id: string;
  gross_amount: number;
  platform_fee: number;
  payout_amount: number;
  status: string;
  payout_method: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  created_at: string;
  upi_ref_id?: string | null;
}

interface EarningsSummary {
  today: number;
  week: number;
  total: number;
}

export default function Earnings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [summary, setSummary] = useState<EarningsSummary>({ today: 0, week: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [workerUpi, setWorkerUpi] = useState<string | null>(null);
  const [recentlyPaidIds, setRecentlyPaidIds] = useState<Set<string>>(new Set());
  const initialLoadDone = useRef(false);
  const notifiedIds = useRef<Set<string>>(new Set());

  // Resolve worker ID
  useEffect(() => {
    if (!user) return;
    const resolve = async () => {
      const { data: w } = await supabase
        .from("workers")
        .select("id, upi_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (w) {
        setWorkerId(w.id);
        setWorkerUpi(w.upi_id);
      } else {
        const { data: wLegacy } = await supabase
          .from("workers")
          .select("id, upi_id")
          .eq("id", user.id)
          .maybeSingle();
        if (wLegacy) {
          setWorkerId(wLegacy.id);
          setWorkerUpi(wLegacy.upi_id);
        }
      }
    };
    resolve();
  }, [user]);

  const fetchPayouts = useCallback(async () => {
    if (!workerId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("worker_payouts")
      .select("*")
      .eq("worker_id", workerId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setPayouts(data);

      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const sum: EarningsSummary = { today: 0, week: 0, total: 0 };
      data.forEach((p) => {
        // Only count paid/processing for totals
        if (["paid", "processing", "pending", "approved"].includes(p.status)) {
          sum.total += p.payout_amount;
          if (p.created_at?.startsWith(todayStr)) sum.today += p.payout_amount;
          if (new Date(p.created_at) >= weekAgo) sum.week += p.payout_amount;
        }
      });
      setSummary(sum);
    }
    setLoading(false);
    initialLoadDone.current = true;
  }, [workerId]);

  useEffect(() => {
    if (!workerId) { setLoading(false); return; }
    fetchPayouts();
  }, [workerId, fetchPayouts]);

  // Refetch on visibility
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && workerId) fetchPayouts();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [workerId, fetchPayouts]);

  // Realtime
  useEffect(() => {
    if (!workerId) return;
    const channel = supabase
      .channel(`worker-payouts:${workerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "worker_payouts", filter: `worker_id=eq.${workerId}` },
        (payload) => {
          const newRow = payload.new as PayoutRow;
          if (initialLoadDone.current && newRow?.status === "paid" && !notifiedIds.current.has(newRow.id)) {
            notifiedIds.current.add(newRow.id);
            setRecentlyPaidIds((prev) => new Set(prev).add(newRow.id));
            toast.success(`₹${newRow.payout_amount} sent to your UPI successfully`);
            setTimeout(() => {
              setRecentlyPaidIds((prev) => { const n = new Set(prev); n.delete(newRow.id); return n; });
            }, 30000);
          }
          fetchPayouts();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [workerId, fetchPayouts]);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "paid": return { label: "Paid", icon: CheckCircle2, cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" };
      case "processing": case "pending": case "approved": return { label: "Processing", icon: Clock, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" };
      case "failed": case "reversed": return { label: "Failed", icon: XCircle, cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" };
      default: return { label: "Processing", icon: Clock, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" };
    }
  };

  const hasUpi = workerUpi && workerUpi.includes("@");

  if (loading) {
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
          <h1 className="text-xl font-bold">Earnings</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {/* UPI Warning */}
        {!hasUpi && (
          <Card className="border-2 border-orange-300 bg-orange-50 dark:bg-orange-950">
            <CardContent className="p-3 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-orange-800 dark:text-orange-300">UPI not set up</p>
                <p className="text-xs text-orange-600 dark:text-orange-400">Add your UPI ID to receive instant payouts</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate("/profile")} className="border-orange-400 text-orange-700">
                Add UPI
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard label="Today" amount={summary.today} icon={IndianRupee} colorClass="from-blue-500 to-blue-600" />
          <SummaryCard label="This Week" amount={summary.week} icon={TrendingUp} colorClass="from-purple-500 to-purple-600" />
          <SummaryCard label="Total Earned" amount={summary.total} icon={Wallet} colorClass="from-green-500 to-green-600" />
        </div>

        {/* Booking-wise Earnings */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Booking Earnings</h2>
          {payouts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="font-medium text-muted-foreground">No earnings yet</p>
                <p className="text-xs text-muted-foreground mt-1">Complete bookings to start earning</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {payouts.map((p) => {
                const cfg = getStatusConfig(p.status);
                const Icon = cfg.icon;
                const isJustPaid = recentlyPaidIds.has(p.id);
                const isFailed = p.status === "failed" || p.status === "reversed";

                return (
                  <Card key={p.id} className={`border shadow-sm transition-all duration-500 ${isJustPaid ? "ring-2 ring-green-500 bg-green-50 dark:bg-green-950" : ""}`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-mono">
                          #{p.booking_id.slice(0, 8)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {isJustPaid && (
                            <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0 animate-pulse">Just Paid</Badge>
                          )}
                          <Badge className={`${cfg.cls} gap-1`}>
                            <Icon className="w-3 h-3" />
                            {cfg.label}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Customer Pays</p>
                          <p className="font-semibold">₹{p.gross_amount}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Platform Fee</p>
                          <p className={`font-semibold ${p.platform_fee > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {p.platform_fee > 0 ? `−₹${p.platform_fee}` : '₹0'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">You Earn</p>
                          <p className="font-bold text-green-600">₹{p.payout_amount}</p>
                        </div>
                      </div>

                      {p.paid_at && (
                        <p className="text-xs text-muted-foreground">
                          Paid on {new Date(p.paid_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      )}
                      {(p as any).upi_ref_id && (
                        <p className="text-xs text-muted-foreground">
                          UPI Ref: {(p as any).upi_ref_id}
                        </p>
                      )}
                      {p.failure_reason && (
                        <p className="text-xs text-destructive">Reason: {p.failure_reason}</p>
                      )}
                      {isFailed && (
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => toast.info("Retry payout triggered. Please wait...")}>
                            <RefreshCw className="w-3 h-3" /> Retry Payout
                          </Button>
                          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => navigate("/profile")}>
                            Update UPI
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div className="h-8" />
      </main>
    </div>
  );
}

function SummaryCard({ label, amount, icon: Icon, colorClass }: { label: string; amount: number; icon: typeof Clock; colorClass: string }) {
  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <CardContent className="p-0">
        <div className={`bg-gradient-to-br ${colorClass} p-3 text-white`}>
          <Icon className="w-5 h-5 mb-1 opacity-80" />
          <p className="text-lg font-bold">₹{amount}</p>
          <p className="text-[10px] font-medium opacity-80 uppercase tracking-wide">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
