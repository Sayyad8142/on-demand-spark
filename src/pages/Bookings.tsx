import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Calendar, Loader2, CheckCircle2, Clock, XCircle } from "lucide-react";
import { DEMO_BOOKINGS } from "@/config/demoData";
import { formatBookingAddress, BookingWithAddress } from "@/lib/address";
import { useCommunityFee } from "@/hooks/useCommunityFee";

type Booking = BookingWithAddress & {
  payout_status?: string | null;
  payout_amount?: number | null;
};

export default function Bookings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isGuestMode = localStorage.getItem('guest_mode') === 'true';
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isGuestMode) {
      setBookings(DEMO_BOOKINGS as any);
      setLoading(false);
      return;
    }
    if (!user) return;

    (async () => {
      try {
        let workerId: string | null = null;
        const { data: w1 } = await supabase.from('workers').select('id').eq('user_id', user.id).maybeSingle();
        if (w1) workerId = w1.id;
        else {
          const { data: w2 } = await supabase.from('workers').select('id').eq('id', user.id).maybeSingle();
          workerId = w2?.id ?? null;
        }
        if (!workerId) { setBookings([]); setLoading(false); return; }

        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('worker_id', workerId)
          .order('created_at', { ascending: false });
        if (error) throw error;

        const bookingIds = (data || []).map(b => b.id);
        const { data: payouts } = await supabase
          .from('worker_payouts')
          .select('booking_id, status, payout_amount')
          .in('booking_id', bookingIds);
        const payoutsMap = new Map(payouts?.map(p => [p.booking_id, { status: p.status, amount: p.payout_amount }]) || []);

        setBookings((data || []).map(b => ({
          ...b,
          payout_status: payoutsMap.get(b.id)?.status ?? null,
          payout_amount: payoutsMap.get(b.id)?.amount ?? null,
        })));
      } catch (e) {
        console.error('Error fetching bookings:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, isGuestMode]);

  const historyBookings = useMemo(
    () => bookings.filter(b => ['completed', 'cancelled'].includes(b.status)),
    [bookings]
  );

  const summary = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;
    let today = 0, week = 0, jobs = 0;
    for (const b of bookings) {
      if (b.status !== 'completed') continue;
      jobs++;
      const amt = Number(b.payout_amount ?? 0);
      const t = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (t >= startOfToday) today += amt;
      if (t >= startOfWeek) week += amt;
    }
    return { today, week, jobs };
  }, [bookings]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <header className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/home")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">My Earnings</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Quick Summary */}
        <div className="grid grid-cols-3 gap-2">
          <SummaryCard label="Today" value={`₹${Math.round(summary.today)}`} accent="text-green-600" />
          <SummaryCard label="This Week" value={`₹${Math.round(summary.week)}`} accent="text-green-600" />
          <SummaryCard label="Total Jobs" value={`${summary.jobs}`} accent="text-foreground" />
        </div>

        {historyBookings.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">No jobs yet</h3>
            <p className="text-sm text-muted-foreground">Your completed jobs will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {historyBookings.map(b => <EarningsCard key={b.id} booking={b} />)}
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <Card className="p-3 text-center border-0 shadow-md">
      <p className={`text-xl font-extrabold ${accent}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </Card>
  );
}

function EarningsCard({ booking }: { booking: Booking }) {
  const isCompleted = booking.status === 'completed';
  const isCancelled = booking.status === 'cancelled';

  const { breakdown } = useCommunityFee(booking.community, booking.price_inr);
  const displayAmount = booking.payout_amount ?? (booking.price_inr ? breakdown.netPayout : null);

  const isPaid = booking.payout_status === 'paid';
  const isFailed = booking.payout_status === 'failed' || booking.payout_status === 'reversed';

  // Card color
  let cardClass = "p-4 rounded-2xl border";
  if (isCancelled) cardClass += " bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900";
  else if (isPaid) cardClass += " bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900";
  else if (isFailed) cardClass += " bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900";
  else cardClass += " bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900";

  const dateStr = booking.scheduled_date
    ? new Date(booking.scheduled_date).toLocaleDateString()
    : booking.created_at
      ? new Date(booking.created_at).toLocaleDateString()
      : '';

  return (
    <div className={cardClass}>
      {/* Top: status + date */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 font-semibold text-sm">
          {isCancelled ? (
            <><XCircle className="w-4 h-4 text-red-600" /> <span className="text-red-700">Cancelled</span></>
          ) : (
            <><CheckCircle2 className="w-4 h-4 text-green-600" /> <span className="text-green-700">Completed</span></>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{dateStr}</div>
      </div>

      {/* Location */}
      <p className="text-base font-bold text-foreground mb-3 leading-snug">
        📍 {formatBookingAddress(booking)}
      </p>

      {/* Big earnings */}
      {isCompleted && (
        <div className="text-center py-3">
          <p className="text-4xl font-extrabold text-green-600">
            {displayAmount != null ? `₹${displayAmount}` : '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">You Earned</p>
        </div>
      )}

      {/* Payment status */}
      {isCompleted && (
        <div className="mt-2 flex items-center justify-center gap-2 text-sm font-semibold">
          {isPaid ? (
            <span className="flex items-center gap-1.5 text-green-700">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Payment Received
            </span>
          ) : isFailed ? (
            <span className="flex items-center gap-1.5 text-red-700">
              <XCircle className="w-4 h-4" />
              Payment Failed
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-700">
              <Clock className="w-4 h-4" />
              Payment Pending
            </span>
          )}
        </div>
      )}
    </div>
  );
}
