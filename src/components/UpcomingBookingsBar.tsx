import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CalendarClock, Clock, IndianRupee } from "lucide-react";
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


export function UpcomingBookingsBar({ limit = 10 }: UpcomingBookingsBarProps) {
  const [bookings, setBookings] = useState<UpcomingBooking[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUpcoming = useCallback(async () => {
    const { data, error } = await supabase.rpc(
      "get_worker_upcoming_scheduled_bookings",
      { p_limit: limit }
    );

    if (error) {
      console.error("[UpcomingBookings] fetch_failed", {
        code: error.code,
        message: error.message,
      });
    } else {
      const nextBookings = (data ?? []) as UpcomingBooking[];
      console.log("[UpcomingBookings] fetched", { count: nextBookings.length });
      setBookings(nextBookings);
    }

    setLoading(false);
  }, [limit]);

  useEffect(() => {
    void fetchUpcoming();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void fetchUpcoming();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    // Realtime can be unavailable on older app sessions. This lightweight
    // refresh keeps the Home bar current when a scheduled booking is created.
    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchUpcoming();
    }, 30_000);

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
          void fetchUpcoming();
        }
      )
      .subscribe();

    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
      window.clearInterval(refreshInterval);
      supabase.removeChannel(channel);
    };
  }, [fetchUpcoming]);

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
    <section
      aria-label="Upcoming scheduled bookings"
      className="fixed left-0 right-0 z-40 border-t border-border bg-background/95 shadow-lg backdrop-blur-sm"
      style={{ 
        bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))'
      }}
    >
      <div className="mx-auto max-w-md px-3 py-2.5">
        <div
          className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1" 
          style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {bookings.map((booking) => {
            const price = booking.price_inr ?? booking.payout_amount;
            const dateStr = formatDate(booking.scheduled_date);
            const isUrgent = dateStr === "Today";

            return (
              <div
                key={booking.booking_id}
                className={`flex-shrink-0 bg-card border rounded-lg px-3 py-2 shadow-sm flex items-center gap-3 ${
                  isUrgent 
                    ? "border-primary/50 bg-primary/5" 
                    : "border-border"
                }`}
              >
                {/* Date & Time */}
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${isUrgent ? "text-primary" : "text-foreground"}`}>
                    {dateStr}
                  </span>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">
                      {formatTime(booking.scheduled_time)}
                    </span>
                  </div>
                </div>

                {/* Price */}
                {price !== null && price !== undefined && (
                  <div className="flex items-center gap-0.5 text-green-600 font-bold text-sm">
                    <IndianRupee className="h-3.5 w-3.5" />
                    <span>{price}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
