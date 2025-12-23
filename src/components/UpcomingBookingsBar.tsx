import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Clock, IndianRupee } from "lucide-react";
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
    <div className="fixed bottom-16 left-0 right-0 z-10 bg-gradient-to-t from-background via-background to-background/95 backdrop-blur-sm border-t border-border shadow-lg">
      <div className="px-3 py-2">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            Upcoming ({bookings.length})
          </span>
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {bookings.map((booking) => {
            const price = booking.price_inr ?? booking.payout_amount;

            return (
              <div
                key={booking.booking_id}
                className="flex-shrink-0 bg-card border border-border rounded-lg px-3 py-2 flex items-center gap-2 shadow-sm"
              >
                <span className="text-xs font-bold text-primary">
                  {formatDate(booking.scheduled_date)}
                </span>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span className="text-xs">
                    {formatTime(booking.scheduled_time)}
                  </span>
                </div>
                {price !== null && price !== undefined && (
                  <span className="text-xs font-bold text-green-600 flex items-center">
                    <IndianRupee className="h-3 w-3" />
                    {price}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

