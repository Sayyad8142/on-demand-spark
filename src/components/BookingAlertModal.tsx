import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, Home, Phone, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";

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

  useEffect(() => {
    if (!booking) {
      setTimeLeft(TIMER_DURATION);
      return;
    }

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

    return () => clearInterval(interval);
  }, [booking]);

  const handleAccept = async () => {
    if (!booking) return;

    try {
      setAccepting(true);
      const { data, error } = await supabase.rpc('accept_booking', {
        p_booking_id: booking.id
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to accept booking');
      }

      toast({
        title: "Booking accepted!",
        description: "Job added to your active jobs"
      });
      onAccept();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setAccepting(false);
    }
  };

  const handleReject = () => {
    toast({
      title: "Booking declined",
      description: "Passing to next available worker"
    });
    onReject();
  };

  if (!booking) return null;

  return (
    <Dialog open={!!booking} onOpenChange={() => handleReject()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            New Booking Alert!
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Timer */}
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10">
              <Clock className="w-5 h-5 text-primary" />
              <span className="text-2xl font-bold text-primary">{timeLeft}s</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Time to respond</p>
          </div>

          {/* Booking Details */}
          <div className="space-y-3 bg-secondary rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">{booking.cust_name}</p>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Phone className="w-3 h-3" />
                  {booking.cust_phone}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 text-sm">
              <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">{booking.community}</p>
                <p className="text-muted-foreground">{booking.flat_no}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Home className="w-4 h-4 text-primary" />
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
                  <span className="text-sm text-muted-foreground">Your earnings</span>
                  <span className="text-lg font-bold text-primary">₹{booking.price_inr}</span>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              variant="outline"
              size="lg"
              onClick={handleReject}
              disabled={accepting}
              className="h-14"
            >
              Reject
            </Button>
            <Button
              size="lg"
              onClick={handleAccept}
              disabled={accepting}
              className="h-14 bg-primary hover:bg-primary/90"
            >
              {accepting ? "Accepting..." : "Accept"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}