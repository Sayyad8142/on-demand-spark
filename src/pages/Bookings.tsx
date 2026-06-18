import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Calendar, Loader2, CheckCircle2, Clock, XCircle, MapPin, Star, IndianRupee } from "lucide-react";
import { DEMO_BOOKINGS } from "@/config/demoData";
import { formatBookingAddress, BookingWithAddress } from "@/lib/address";
import { useCommunityFee } from "@/hooks/useCommunityFee";

type Booking = BookingWithAddress & {
  payout_status?: string | null;
  payout_amount?: number | null;
  rating?: number | null;
};

const PAGE_SIZE = 15;
const HISTORY_STATUSES = ['completed', 'cancelled'] as const;

export default function Bookings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isGuestMode = localStorage.getItem('guest_mode') === 'true';

  const [workerId, setWorkerId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [summary, setSummary] = useState({ today: 0, week: 0, jobs: 0 });
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Resolve worker id once
  useEffect(() => {
    if (isGuestMode) {
      setBookings(DEMO_BOOKINGS as any);
      setSummary({ today: 0, week: 0, jobs: (DEMO_BOOKINGS as any).length });
      setHasMore(false);
      setLoading(false);
      return;
    }
    if (!user) return;
    (async () => {
      const { data: w1 } = await supabase.from('workers').select('id').eq('user_id', user.id).maybeSingle();
      if (w1) { setWorkerId(w1.id); return; }
      const { data: w2 } = await supabase.from('workers').select('id').eq('id', user.id).maybeSingle();
      setWorkerId(w2?.id ?? null);
      if (!w2) setLoading(false);
    })();
  }, [user, isGuestMode]);

  const loadPage = useCallback(async (wId: string, pageIdx: number) => {
    const from = pageIdx * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('worker_id', wId)
      .in('status', HISTORY_STATUSES as unknown as string[])
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    const rows = data || [];
    const ids = rows.map(b => b.id);
    let enriched: Booking[] = rows as any;
    if (ids.length) {
      const [payoutsRes, ratingsRes] = await Promise.all([
        supabase.from('worker_payouts').select('booking_id, status, payout_amount').in('booking_id', ids),
        supabase.from('worker_ratings').select('booking_id, rating').in('booking_id', ids),
      ]);
      const payoutsMap = new Map(payoutsRes.data?.map(p => [p.booking_id, { status: p.status, amount: p.payout_amount }]) || []);
      const ratingsMap = new Map(ratingsRes.data?.map(r => [r.booking_id, r.rating]) || []);
      enriched = rows.map(b => ({
        ...b,
        payout_status: payoutsMap.get(b.id)?.status ?? null,
        payout_amount: payoutsMap.get(b.id)?.amount ?? null,
        rating: ratingsMap.get(b.id) ?? null,
      })) as any;
    }
    return enriched;
  }, []);

  // Initial page + summary in parallel
  useEffect(() => {
    if (!workerId) return;
    let cancelled = false;
    (async () => {
      try {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);

        const [firstPage, totalCountRes, weekPayoutsRes] = await Promise.all([
          loadPage(workerId, 0),
          supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .eq('worker_id', workerId)
            .eq('status', 'completed'),
          supabase
            .from('worker_payouts')
            .select('payout_amount, created_at')
            .eq('worker_id', workerId)
            .gte('created_at', startOfWeek.toISOString()),
        ]);

        if (cancelled) return;

        let today = 0, week = 0;
        for (const p of (weekPayoutsRes.data || [])) {
          const amt = Number(p.payout_amount ?? 0);
          const t = p.created_at ? new Date(p.created_at).getTime() : 0;
          week += amt;
          if (t >= startOfToday.getTime()) today += amt;
        }
        setSummary({ today, week, jobs: totalCountRes.count ?? 0 });
        setBookings(firstPage);
        setHasMore(firstPage.length === PAGE_SIZE);
        setPage(0);
      } catch (e) {
        console.error('Error fetching bookings:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workerId, loadPage]);

  // Load more
  const loadMore = useCallback(async () => {
    if (!workerId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const more = await loadPage(workerId, next);
      setBookings(prev => [...prev, ...more]);
      setPage(next);
      setHasMore(more.length === PAGE_SIZE);
    } catch (e) {
      console.error('Error loading more bookings:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [workerId, page, hasMore, loadingMore, loadPage]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const el = sentinelRef.current;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore();
    }, { rootMargin: '200px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore, hasMore]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary pb-24">
      <header className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/home")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">My Bookings</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Quick Summary */}
        <div className="grid grid-cols-3 gap-2">
          <SummaryCard label="Today" value={`₹${Math.round(summary.today)}`} accent="text-green-600" />
          <SummaryCard label="This Week" value={`₹${Math.round(summary.week)}`} accent="text-green-600" />
          <SummaryCard label="Total Jobs" value={`${summary.jobs}`} accent="text-foreground" />
        </div>

        {bookings.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">No jobs yet</h3>
            <p className="text-sm text-muted-foreground">Your completed jobs will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map(b => <BookingCard key={b.id} booking={b} />)}

            {/* Infinite scroll sentinel */}
            {hasMore && (
              <div ref={sentinelRef} className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!hasMore && bookings.length > PAGE_SIZE && (
              <p className="text-center text-xs text-muted-foreground py-4">No more bookings</p>
            )}
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

function BookingCard({ booking }: { booking: Booking }) {
  const isCompleted = booking.status === 'completed';
  const isCancelled = booking.status === 'cancelled';

  const { breakdown } = useCommunityFee(booking.community, booking.price_inr);
  const displayAmount = booking.payout_amount ?? (booking.price_inr ? breakdown.netPayout : null);

  const isPaid = booking.payout_status === 'paid';
  const isFailed = booking.payout_status === 'failed' || booking.payout_status === 'reversed';

  const when = booking.scheduled_date
    ? new Date(booking.scheduled_date)
    : booking.created_at
      ? new Date(booking.created_at)
      : null;
  const dateStr = when ? when.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const timeStr = when ? when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';

  const rating = booking.rating ?? null;

  const theme = isCancelled
    ? {
        bar: 'bg-red-500',
        cardBg: 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/40 dark:to-rose-950/30',
        border: 'border-red-200 dark:border-red-900',
        pillBg: 'bg-red-500',
        statusText: 'Cancelled',
        StatusIcon: XCircle,
      }
    : {
        bar: 'bg-green-500',
        cardBg: 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/30',
        border: 'border-green-200 dark:border-green-900',
        pillBg: 'bg-green-600',
        statusText: 'Completed',
        StatusIcon: CheckCircle2,
      };

  const StatusIcon = theme.StatusIcon;

  return (
    <div className={`relative overflow-hidden rounded-2xl border shadow-sm ${theme.cardBg} ${theme.border}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${theme.bar}`} />

      <div className="p-4 pl-5">
        <div className="flex items-center justify-between mb-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-bold ${theme.pillBg}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            {theme.statusText}
          </span>
          <div className="text-right">
            <p className="text-xs font-semibold text-foreground">{dateStr}</p>
            {timeStr && <p className="text-[11px] text-muted-foreground">{timeStr}</p>}
          </div>
        </div>

        <div className="flex items-start gap-2 mb-3">
          <MapPin className={`w-4 h-4 mt-0.5 shrink-0 ${isCancelled ? 'text-red-500' : 'text-green-600'}`} />
          <p className="text-sm font-bold text-foreground leading-snug">
            {formatBookingAddress(booking)}
          </p>
        </div>

        {isCompleted ? (
          <div className="flex items-end justify-between bg-white/60 dark:bg-black/20 rounded-xl px-3 py-2.5 mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">You Earned</p>
              <p className="text-2xl font-extrabold text-green-700 flex items-center">
                <IndianRupee className="w-5 h-5" />
                {displayAmount != null ? displayAmount : '—'}
              </p>
            </div>
            <PaymentBadge isPaid={isPaid} isFailed={isFailed} />
          </div>
        ) : (
          <div className="bg-white/60 dark:bg-black/20 rounded-xl px-3 py-2.5 mb-3">
            <p className="text-sm font-semibold text-red-700">Booking was cancelled</p>
            <p className="text-xs text-muted-foreground mt-0.5">No earnings for this job</p>
          </div>
        )}

        {isCompleted && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Customer Rating</span>
            {rating != null && rating > 0 ? (
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <Star
                    key={n}
                    className={`w-4 h-4 ${n <= Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                  />
                ))}
                <span className="ml-1 text-sm font-bold text-foreground">{rating.toFixed(1)}</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground italic">Not rated yet</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentBadge({ isPaid, isFailed }: { isPaid: boolean; isFailed: boolean }) {
  if (isPaid) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-green-600 text-white text-xs font-bold">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Paid
      </span>
    );
  }
  if (isFailed) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-red-600 text-white text-xs font-bold">
        <XCircle className="w-3.5 h-3.5" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-amber-500 text-white text-xs font-bold">
      <Clock className="w-3.5 h-3.5" />
      Pending
    </span>
  );
}
