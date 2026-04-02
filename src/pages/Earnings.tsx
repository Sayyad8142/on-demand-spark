import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Wallet, Clock, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPayoutStatus } from "@/lib/payoutStatus";

interface PayoutRow {
  id: string;
  booking_id: string;
  booking_amount: number;
  platform_fee: number;
  payout_amount: number;
  status: string;
  payout_method: string | null;
  hold_reason: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  created_at: string;
}

interface EarningsSummary {
  pending: number;
  paid: number;
  held: number;
  failed: number;
}

export default function Earnings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [summary, setSummary] = useState<EarningsSummary>({ pending: 0, paid: 0, held: 0, failed: 0 });
  const [loading, setLoading] = useState(true);
  const [workerId, setWorkerId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const resolveAndFetch = async () => {
      const { data: w } = await supabase
        .from("workers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const wid = w?.id ?? null;
      if (!wid) {
        const { data: wLegacy } = await supabase
          .from("workers")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();
        if (wLegacy) setWorkerId(wLegacy.id);
      } else {
        setWorkerId(wid);
      }
    };

    resolveAndFetch();
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

      const sum: EarningsSummary = { pending: 0, paid: 0, held: 0, failed: 0 };
      data.forEach((p) => {
        const bucket = getPayoutStatus(p.status).bucket;
        sum[bucket] += p.payout_amount;
      });
      setSummary(sum);
    }
    setLoading(false);
  }, [workerId]);

  // Initial fetch
  useEffect(() => {
    if (!workerId) {
      setLoading(false);
      return;
    }
    fetchPayouts();
  }, [workerId, fetchPayouts]);

  // Refetch on page focus / visibility change
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && workerId) {
        fetchPayouts();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [workerId, fetchPayouts]);

  // Realtime subscription for payout status changes
  useEffect(() => {
    if (!workerId) return;

    const channel = supabase
      .channel(`worker-payouts:${workerId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "worker_payouts",
          filter: `worker_id=eq.${workerId}`,
        },
        () => {
          console.log("📡 Payout status changed, refetching...");
          fetchPayouts();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "worker_payouts",
          filter: `worker_id=eq.${workerId}`,
        },
        () => {
          console.log("📡 New payout created, refetching...");
          fetchPayouts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workerId, fetchPayouts]);

  const renderStatusBadge = (status: string) => {
    const cfg = getPayoutStatus(status);
    const Icon = cfg.icon;
    return (
      <Badge className={`${cfg.badgeClass} gap-1`}>
        <Icon className="w-3 h-3" />
        {cfg.label}
      </Badge>
    );
  };

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
          <h1 className="text-xl font-bold">Earnings & Payouts</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <SummaryCard label="Pending" amount={summary.pending} icon={Clock} colorClass="text-amber-600 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800" />
          <SummaryCard label="Paid to You" amount={summary.paid} icon={CheckCircle2} colorClass="text-green-600 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800" />
          <SummaryCard label="On Hold" amount={summary.held} icon={AlertTriangle} colorClass="text-orange-600 bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800" />
          <SummaryCard label="Failed" amount={summary.failed} icon={XCircle} colorClass="text-red-600 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800" />
        </div>

        {/* Payout History */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
            <TabsTrigger value="pending" className="flex-1">Pending</TabsTrigger>
            <TabsTrigger value="paid" className="flex-1">Paid</TabsTrigger>
            <TabsTrigger value="issues" className="flex-1">Issues</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-3 mt-3">
            <PayoutList payouts={payouts} renderStatusBadge={renderStatusBadge} />
          </TabsContent>
          <TabsContent value="pending" className="space-y-3 mt-3">
            <PayoutList payouts={payouts.filter((p) => ["pending", "approved", "processing"].includes(p.status))} renderStatusBadge={renderStatusBadge} />
          </TabsContent>
          <TabsContent value="paid" className="space-y-3 mt-3">
            <PayoutList payouts={payouts.filter((p) => p.status === "paid")} renderStatusBadge={renderStatusBadge} />
          </TabsContent>
          <TabsContent value="issues" className="space-y-3 mt-3">
            <PayoutList payouts={payouts.filter((p) => ["held", "failed", "reversed"].includes(p.status))} renderStatusBadge={renderStatusBadge} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function SummaryCard({ label, amount, icon: Icon, colorClass }: { label: string; amount: number; icon: typeof Clock; colorClass: string }) {
  return (
    <Card className={`border-2 ${colorClass}`}>
      <CardContent className="p-3 flex items-center gap-3">
        <Icon className="w-5 h-5 flex-shrink-0" />
        <div>
          <p className="text-xs font-medium opacity-70">{label}</p>
          <p className="text-lg font-bold">₹{amount}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PayoutList({ payouts, renderStatusBadge }: { payouts: PayoutRow[]; renderStatusBadge: (s: string) => React.ReactNode }) {
  if (payouts.length === 0) {
    return (
      <div className="text-center py-8">
        <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No payouts to show</p>
      </div>
    );
  }

  return (
    <>
      {payouts.map((p) => (
        <Card key={p.id} className="border shadow-sm">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-mono">
                #{p.booking_id.slice(0, 8)}
              </span>
              {renderStatusBadge(p.status)}
            </div>

            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Booking</p>
                <p className="font-semibold">₹{p.booking_amount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fee</p>
                <p className="font-semibold text-destructive">-₹{p.platform_fee}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Your Payout</p>
                <p className="font-bold text-green-600">₹{p.payout_amount}</p>
              </div>
            </div>

            {p.paid_at && (
              <p className="text-xs text-muted-foreground">
                Paid on {new Date(p.paid_at).toLocaleDateString()}
              </p>
            )}
            {p.hold_reason && (
              <p className="text-xs text-orange-600">Reason: {p.hold_reason}</p>
            )}
            {p.failure_reason && (
              <p className="text-xs text-destructive">Reason: {p.failure_reason}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </>
  );
}
