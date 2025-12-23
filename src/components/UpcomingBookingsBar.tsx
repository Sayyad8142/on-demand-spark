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
  bathroom_cleaning: "Bathroom",
};

export function UpcomingBookingsBar({ workerId }: UpcomingBookingsBarProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workerId) {
      setLoading(false);
      return;
    }

    const fetchUpcoming = async () => {
      const today = new Date().toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("worker_id", workerId)
        .in("status", ["assigned", "confirmed", "accepted"])
        .gte("scheduled_date", today)
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true })
        .limit(10);

      if (!error && data) {
        console.log("📅 Upcoming bookings fetched:", data.length);
        setBookings(data);
      } else if (error) {
        console.error("❌ Error fetching upcoming bookings:", error);
      }
      setLoading(false);
    };

    fetchUpcoming();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`upcoming-bookings:${workerId}`)
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
    <div className="fixed bottom-16 left-0 right-0 z-10 bg-gradient-to-t from-background via-background to-background/95 backdrop-blur-sm border-t border-border shadow-lg">
      <div className="px-3 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            Upcoming Bookings ({bookings.length})
          </span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
          {bookings.map((booking) => {
            const price = booking.price_inr || booking.payout_amount;
            return (
              <div
                key={booking.id}
                className="flex-shrink-0 bg-card border border-border rounded-xl px-4 py-3 min-w-[160px] shadow-sm"
              >
                {/* Date & Time Row */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-bold text-primary">
                    {formatDate(booking.scheduled_date)}
                  </span>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">
                      {formatTime(booking.scheduled_time)}
                    </span>
                  </div>
                </div>
                {/* Service & Price Row */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    {SERVICE_LABELS[booking.service_type] || booking.service_type}
                  </span>
                  {price && (
                    <span className="text-sm font-bold text-green-600 flex items-center">
                      <IndianRupee className="h-3.5 w-3.5" />
                      {price}
                    </span>
                  )}
                </div>
                {/* Flat info */}
                <div className="mt-1 text-xs text-muted-foreground truncate">
                  Flat {booking.flat_no}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
