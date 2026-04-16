import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, MapPin, Calendar, Loader2, User, Star, CreditCard, CheckCircle2, Clock } from "lucide-react";
import { getPayoutStatus, PAYOUT_ESTIMATING_LABEL } from "@/lib/payoutStatus";
import { DEMO_BOOKINGS } from "@/config/demoData";
import { formatBookingAddress, BookingWithAddress } from "@/lib/address";
import { calcWorkerPayout } from "@/lib/payoutCalc";

type Booking = BookingWithAddress & { rating?: number | null; payout_status?: string | null; payout_amount?: number | null };

export default function Bookings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isGuestMode = localStorage.getItem('guest_mode') === 'true';
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (isGuestMode) {
      setBookings(DEMO_BOOKINGS as any);
      setLoading(false);
      return;
    }
    
    if (!user) return;

    const fetchBookings = async () => {
      try {
        // First, resolve the worker record id from user_id
        let workerId: string | null = null;

        // Try by user_id first
        const { data: workerByUserId } = await supabase
          .from('workers')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (workerByUserId) {
          workerId = workerByUserId.id;
        } else {
          // Fallback: legacy workers where workers.id === auth.uid
          const { data: workerById } = await supabase
            .from('workers')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();
          workerId = workerById?.id ?? null;
        }

        if (!workerId) {
          console.log('⚠️ No worker record found for user:', user.id);
          setBookings([]);
          setLoading(false);
          return;
        }

        console.log('🔍 Fetching booking history for worker_id:', workerId);

        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('worker_id', workerId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        console.log('📦 Fetched', data?.length ?? 0, 'bookings');
        
        // Fetch ratings for completed bookings
        const bookingIds = (data || []).map(b => b.id);
        const { data: ratings } = await supabase
          .from('worker_ratings')
          .select('booking_id, rating')
          .in('booking_id', bookingIds);
        
        // Fetch payout info
        const { data: payouts } = await supabase
          .from('worker_payouts')
          .select('booking_id, status, payout_amount')
          .in('booking_id', bookingIds);
        
        // Merge ratings and payouts into bookings
        const ratingsMap = new Map(ratings?.map(r => [r.booking_id, r.rating]) || []);
        const payoutsMap = new Map(payouts?.map(p => [p.booking_id, { status: p.status, amount: p.payout_amount }]) || []);
        const bookingsWithRatings = (data || []).map(b => ({
          ...b,
          rating: ratingsMap.get(b.id) ?? null,
          payout_status: payoutsMap.get(b.id)?.status ?? null,
          payout_amount: payoutsMap.get(b.id)?.amount ?? null,
        }));
        
        setBookings(bookingsWithRatings);
      } catch (error) {
        console.error('Error fetching bookings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBookings();
  }, [user, isGuestMode]);

  const historyBookings = bookings.filter(b => 
    ['completed', 'cancelled'].includes(b.status)
  );

  const filteredHistory = historyBookings.filter(b =>
    b.cust_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.community.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.flat_no.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    const colors = {
      'accepted': 'bg-blue-100 text-blue-700',
      'on_the_way': 'bg-purple-100 text-purple-700',
      'started': 'bg-green-100 text-green-700',
      'completed': 'bg-emerald-100 text-emerald-700',
      'cancelled': 'bg-gray-100 text-gray-700'
    };
    return colors[status as keyof typeof colors] || 'bg-secondary';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/home")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">My Bookings</h1>
              <p className="text-sm text-muted-foreground">View your job history</p>
            </div>
          </div>

        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {filteredHistory.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-semibold mb-2">No booking history</h3>
            <p className="text-sm text-muted-foreground">Your completed jobs will appear here</p>
          </div>
        ) : (
          filteredHistory.map(booking => (
            <BookingCard key={booking.id} booking={booking} getStatusColor={getStatusColor} />
          ))
        )}
      </main>
    </div>
  );
}

function BookingCard({ booking, getStatusColor }: { booking: Booking; getStatusColor: (status: string) => string }) {
  const isCompleted = booking.status === 'completed';
  const isCancelled = booking.status === 'cancelled';
  const numberColor = isCompleted ? 'text-green-500' : 'text-red-500';
  
  const cardClass = isCancelled
    ? "p-3 shadow-lg border-2 border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900"
    : "p-3 shadow-lg border-0";
  
  return (
    <Card className={cardClass}>
      <div className="flex items-center justify-between mb-2">
        {/* Worker Photo */}
        {booking.worker_name && (
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md border-2 border-white dark:border-gray-800 overflow-hidden">
              {booking.worker_photo_url ? (
                <img 
                  src={booking.worker_photo_url} 
                  alt={booking.worker_name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-5 h-5 text-primary-foreground" />
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Worker</p>
              <p className="text-sm font-semibold">{booking.worker_name}</p>
            </div>
          </div>
        )}
        <Badge className={getStatusColor(booking.status)}>
          {booking.status.replace('_', ' ')}
        </Badge>
      </div>

      {/* Flat Number Display */}
      <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-2 shadow-sm">
        <p className={`font-extrabold text-center ${numberColor} text-xl tracking-tight`}>{formatBookingAddress(booking)}</p>
      </div>

      {/* Customer Name */}
      <div className="mb-2">
        <p className="text-[10px] text-gray-500 dark:text-gray-400">Customer</p>
        <p className="font-semibold text-sm">{booking.cust_name}</p>
      </div>

      {/* Community */}
      <div className="flex items-center gap-1.5 mb-2">
        <MapPin className={`w-3.5 h-3.5 ${numberColor}`} />
        <p className="text-xs text-muted-foreground">{booking.community}</p>
      </div>

      <div className="flex items-center justify-between text-xs border-t pt-2">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            {booking.service_type === 'cook' ? '📦 Legacy Booking' : booking.service_type.replace('_', ' ')}
          </span>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="w-3 h-3" />
            {booking.scheduled_date 
              ? new Date(booking.scheduled_date).toLocaleDateString()
              : booking.created_at 
                ? new Date(booking.created_at).toLocaleDateString()
                : 'N/A'}
            {booking.scheduled_time && (
              <span className="ml-1">
                {booking.scheduled_time.slice(0, 5)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Customer Rating */}
          {booking.rating != null && booking.rating > 0 ? (
            <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span className="font-semibold text-amber-600 dark:text-amber-400">{booking.rating}</span>
            </div>
          ) : booking.status === 'completed' ? (
            <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded-full">
              <Star className="w-3 h-3 text-gray-300" />
              <span className="text-xs text-muted-foreground">—</span>
            </div>
          ) : null}
          {booking.payout_amount != null ? (
            <span className={`font-bold ${numberColor} text-base`}>₹{booking.payout_amount}</span>
          ) : booking.price_inr ? (
            <span className={`font-bold ${numberColor} text-base`}>~₹{calcWorkerPayout(booking.price_inr)}</span>
          ) : null}
        </div>
      </div>

      {/* Payment & Payout Status */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {booking.payment_method && booking.payment_method !== 'razorpay' && (
          <Badge variant="outline" className="text-[10px] gap-0.5 h-5">
            <CreditCard className="w-2.5 h-2.5" />
            {booking.payment_method === 'pay_after_service' ? 'Pay After' : booking.payment_method.replace('_', ' ')}
          </Badge>
        )}
        {booking.payment_status === 'paid' && (
          <Badge className="bg-green-100 text-green-700 text-[10px] gap-0.5 h-5">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Paid
          </Badge>
        )}
        {booking.payout_status ? (() => {
          const cfg = getPayoutStatus(booking.payout_status);
          const Icon = cfg.icon;
          return (
            <Badge className={`text-[10px] gap-0.5 h-5 ${cfg.badgeClass}`}>
              <Icon className="w-2.5 h-2.5" />
              {cfg.label}
              {booking.payout_amount != null && ` ₹${booking.payout_amount}`}
            </Badge>
          );
        })() : booking.status === 'completed' ? (
          <Badge className="text-[10px] gap-0.5 h-5 bg-amber-100 text-amber-700">
            <Clock className="w-2.5 h-2.5" />
            {PAYOUT_ESTIMATING_LABEL}
          </Badge>
        ) : null}
      </div>
    </Card>
  );
}