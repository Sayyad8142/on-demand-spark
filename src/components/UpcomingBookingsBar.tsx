import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, isToday, isTomorrow } from "date-fns";

type UpcomingBooking = {
  booking_id: string;
  community: string;
  service_type: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  price_inr: number | null;
  payout_amount: number | null;
  status: string;
};

interface UpcomingBookingsBarProps {
  limit?: number;
}

const SERVICE_LABELS: Record<string, string> = {
  maid: "Maid",
  cook: "Cook",
  cleaning: "Cleaning",
  bathroom_cleaning: "Bathroom",
};

export function UpcomingBookingsBar({ limit = 10 }: UpcomingBookingsBarProps) {
  const [bookings, setBookings] = useState<UpcomingBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUpcoming = async () => {
      const { data, error } = await supabase.rpc(
        "get_worker_upcoming_scheduled_bookings",
        { p_limit: limit }
      );

      if (!error && data) {
        console.log("📅 Upcoming scheduled bookings fetched:", data.length);
        setBookings(data as UpcomingBooking[]);
      } else if (error) {
        console.error("❌ Error fetching upcoming scheduled bookings:", error);
      }

      setLoading(false);
    };

    fetchUpcoming();

    const channel = supabase
      .channel("upcoming-scheduled-bookings")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
        },
        () => {
          fetchUpcoming();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [limit]);

  if (loading || bookings.length === 0) return null;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = parseISO(dateStr);
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    return format(date, "dd MMM");
  };

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return "";
    const [hours, minutes] = timeStr.split(":");
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  return (
    <div className="fixed bottom-16 left-0 right-0 z-10 safe-area-inset-bottom">
      <div 
        className="flex gap-2 overflow-x-auto px-3 py-2" 
        style={{ 
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {bookings.map((booking) => {
          const price = booking.price_inr ?? booking.payout_amount;

          return (
            <div
              key={booking.booking_id}
              className="flex-shrink-0 bg-primary/10 rounded-full px-3 py-1.5 flex items-center gap-2"
            >
              <span className="text-xs font-semibold text-primary whitespace-nowrap">
                {formatDate(booking.scheduled_date)}
              </span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatTime(booking.scheduled_time)}
              </span>
              {price !== null && price !== undefined && (
                <span className="text-xs font-semibold text-green-600 whitespace-nowrap">
                  ₹{price}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

