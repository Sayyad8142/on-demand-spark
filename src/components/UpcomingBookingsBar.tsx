import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Calendar, Clock, IndianRupee } from "lucide-react";
import { format, parseISO, isToday, isTomorrow } from "date-fns";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];

interface UpcomingBookingsBarProps {
  workerId: string | undefined;
}

const SERVICE_LABELS: Record<string, string> = {
  maid: "Maid",
  cook: "Cook",
  cleaning: "Cleaning",
  bathroom: "Bathroom",
};

export function UpcomingBookingsBar({ workerId }: UpcomingBookingsBarProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workerId) return;

    const fetchUpcoming = async () => {
      const today = new Date().toISOString().split("T")[0];
      
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("worker_id", workerId)
        .in("status", ["confirmed", "accepted"])
        .gte("scheduled_date", today)
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true })
        .limit(10);

      if (!error && data) {
        setBookings(data);
      }
      setLoading(false);
    };

    fetchUpcoming();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("upcoming-bookings")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `worker_id=eq.${workerId}`,
        },
        () => {
          fetchUpcoming();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workerId]);

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
    <div className="fixed bottom-16 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm border-t border-border">
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-muted-foreground">
            Upcoming ({bookings.length})
          </span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
          {bookings.map((booking) => (
            <div
              key={booking.id}
              className="flex-shrink-0 bg-card border border-border rounded-lg px-3 py-2 min-w-[140px]"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-semibold text-primary">
                  {formatDate(booking.scheduled_date)}
                </span>
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {formatTime(booking.scheduled_time)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">
                  {SERVICE_LABELS[booking.service_type] || booking.service_type}
                </span>
                {booking.payout_amount && (
                  <span className="text-xs font-semibold text-green-600 flex items-center">
                    <IndianRupee className="h-3 w-3" />
                    {booking.payout_amount}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
