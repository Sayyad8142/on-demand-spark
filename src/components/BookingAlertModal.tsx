import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, Home, Phone, User, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";
import { startAlertOverlay, stopAlertOverlay, showStickyNotification } from "@/lib/alertOverlay";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];

interface BookingAlertModalProps {
  booking: Booking | null;
  onAccept: () => void;
  onReject: () => void;
}

const TIMER_DURATION = 30; // seconds

export default function BookingAlertModal({ booking, onAccept, onReject }: BookingAlertModalProps) {
  const { toast } = useToast();
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION);
  const [accepting, setAccepting] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  useEffect(() => {
    if (!booking) {
      setTimeLeft(TIMER_DURATION);
      stopAlertOverlay();
      return;
    }

    // Start alert overlay and notification
    startAlertOverlay();
    showStickyNotification({
      id: booking.id,
      customerName: booking.cust_name,
      service: booking.service_type.replace('_', ' ').toUpperCase(),
    });

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleReject();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      stopAlertOverlay();
    };
  }, [booking]);

  const handleEnableSound = async () => {
    setSoundEnabled(true);
    await startAlertOverlay();
  };

  const handleAccept = async () => {
    if (!booking) return;

    try {
      setAccepting(true);
      stopAlertOverlay();
      
      const { data, error } = await supabase.rpc('try_accept_booking', {
        p_booking_id: booking.id
      });

      if (error) {
        // Handle specific error messages
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('already taken')) {
          throw new Error('This booking has already been accepted by another worker');
        } else if (errorMessage.includes('not eligible')) {
          throw new Error('You are not eligible for this booking');
        } else if (errorMessage.includes('not found') || errorMessage.includes('already being processed')) {
          throw new Error('This booking is no longer available');
        } else if (errorMessage.includes('expired')) {
          throw new Error('This booking has expired');
        } else {
          throw error;
        }
      }

      toast({
        title: "Booking accepted!",
        description: "Job added to your active jobs"
      });
      onAccept();
    } catch (error: any) {
      toast({
        title: "Booking not accepted",
        description: error.message,
        variant: "destructive"
      });
      onReject(); // Auto-dismiss on error
    } finally {
      setAccepting(false);
    }
  };

  const handleReject = () => {
    stopAlertOverlay();
    toast({
      title: "Booking declined",
      description: "Passing to next available worker"
    });
    onReject();
  };

  if (!booking) return null;

  return (
    <>
      {booking && (
        <div className="alert-overlay-backdrop">
          <div className="alert-overlay-card">
            <h2 className="text-2xl font-bold mb-4" style={{ color: 'hsl(var(--primary))' }}>
              🔔 New Booking Alert!
            </h2>

            {/* Timer */}
            <div className="text-center mb-4">
              <div className="alert-overlay-timer" style={{ color: 'hsl(var(--primary))' }}>
                {timeLeft}s
              </div>
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Time to respond</p>
            </div>

            {/* Sound Enable Button */}
            {!soundEnabled && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEnableSound}
                className="w-full mb-4 border-2"
              >
                <Volume2 className="w-4 h-4 mr-2" />
                🔊 Tap to enable sound
              </Button>
            )}

            {/* Booking Details */}
            <div className="space-y-3 rounded-2xl p-4" style={{ background: 'hsl(var(--secondary))' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'hsl(var(--primary) / 0.1)' }}>
                  <User className="w-5 h-5" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold">{booking.cust_name}</p>
                  <div className="flex items-center gap-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    <Phone className="w-3 h-3" />
                    {booking.cust_phone}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 text-sm text-left">
                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'hsl(var(--primary))' }} />
                <div>
                  <p className="font-medium">{booking.community}</p>
                  <p style={{ color: 'hsl(var(--muted-foreground))' }}>{booking.flat_no}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Home className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
                <Badge variant="outline" className="font-medium">
                  {booking.service_type.replace('_', ' ').toUpperCase()}
                </Badge>
                {booking.booking_type === 'scheduled' && booking.scheduled_time && (
                  <Badge variant="secondary">
                    {booking.scheduled_time}
                  </Badge>
                )}
              </div>

              {booking.price_inr && (
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Your earnings</span>
                    <span className="text-lg font-bold" style={{ color: 'hsl(var(--primary))' }}>₹{booking.price_inr}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3 pt-4">
              <Button
                variant="outline"
                size="lg"
                onClick={handleReject}
                disabled={accepting}
                className="h-14 text-base font-semibold"
              >
                Reject
              </Button>
              <Button
                size="lg"
                onClick={handleAccept}
                disabled={accepting}
                className="h-14 text-base font-semibold"
                style={{ background: 'hsl(var(--primary))' }}
              >
                {accepting ? "Accepting..." : "Accept"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}