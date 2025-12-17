import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Calendar, Clock } from "lucide-react";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { useTranslation } from "react-i18next";

interface UpcomingBookingsBarProps {
  workerId: string | undefined;
  communityName: string | undefined;
  serviceTypes: string[] | undefined;
}

interface ScheduledBooking {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  service_type: string;
  community: string;
  flat_no: string;
}

export function UpcomingBookingsBar({ workerId, communityName, serviceTypes }: UpcomingBookingsBarProps) {
  const { t } = useTranslation();
  const [nextBooking, setNextBooking] = useState<ScheduledBooking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workerId || !communityName || !serviceTypes?.length) {
      setLoading(false);
      return;
    }

    const fetchUpcomingBookings = async () => {
      const today = new Date().toISOString().split('T')[0];
      const currentTime = new Date().toTimeString().split(' ')[0];

      const { data, error } = await supabase
        .from('bookings')
        .select('id, scheduled_date, scheduled_time, service_type, community, flat_no')
        .eq('worker_id', workerId)
        .eq('community', communityName)
        .in('service_type', serviceTypes)
        .eq('booking_type', 'scheduled')
        .in('status', ['confirmed', 'accepted'])
        .not('scheduled_date', 'is', null)
        .gte('scheduled_date', today)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true })
        .limit(10);

      if (error) {
        console.error('Error fetching upcoming bookings:', error);
        setLoading(false);
        return;
      }

      // Filter out bookings that have already passed today
      const upcoming = (data || []).filter(booking => {
        if (booking.scheduled_date === today && booking.scheduled_time) {
          return booking.scheduled_time > currentTime;
        }
        return true;
      });

      setNextBooking(upcoming[0] || null);
      setLoading(false);
    };

    fetchUpcomingBookings();

    // Set up real-time subscription
    const channel = supabase
      .channel('upcoming-bookings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `worker_id=eq.${workerId}`,
        },
        () => {
          fetchUpcomingBookings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workerId, communityName, serviceTypes]);

  if (loading || !nextBooking) {
    return null;
  }

  const formatDate = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return t('common.today', 'Today');
    if (isTomorrow(date)) return t('common.tomorrow', 'Tomorrow');
    return format(date, 'EEE, MMM d');
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes));
    return format(date, 'h:mm a');
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 z-10">
      <Card className="bg-gradient-to-r from-blue-500 to-indigo-600 border-0 shadow-lg">
        <div className="p-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-white/80 font-medium uppercase tracking-wide">
              {t('home.upcomingBooking', 'Upcoming Booking')}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Clock className="w-4 h-4 text-white/90" />
              <p className="text-white font-bold text-lg">
                {formatDate(nextBooking.scheduled_date)} at {formatTime(nextBooking.scheduled_time)}
              </p>
            </div>
            <p className="text-xs text-white/70 mt-1 capitalize">
              {nextBooking.service_type} • {nextBooking.flat_no}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
