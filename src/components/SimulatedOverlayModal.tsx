import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Database } from '@/integrations/supabase/types';

type Booking = Database['public']['Tables']['bookings']['Row'];

interface SimulatedOverlayModalProps {
  open: boolean;
  booking: Booking | null;
  onAccept: () => void;
  onReject: () => void;
  timeoutSec?: number;
}

export function SimulatedOverlayModal({
  open,
  booking,
  onAccept,
  onReject,
  timeoutSec = 30,
}: SimulatedOverlayModalProps) {
  const [seconds, setSeconds] = useState(timeoutSec);

  useEffect(() => {
    if (!open) return;

    setSeconds(timeoutSec);

    // Play alert sound if user has interacted before
    try {
      const audio = new Audio('/sounds/booking_alert.mp3');
      audio.play().catch(() => console.log('Could not play alert sound'));
    } catch (e) {
      console.log('Audio playback not available');
    }

    // Vibrate if supported
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }

    const interval = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(interval);
          onReject();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [open, timeoutSec, onReject]);

  if (!booking) return null;

  const progress = ((timeoutSec - seconds) / timeoutSec) * 100;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onReject()}>
      <DialogContent 
        className="max-w-sm rounded-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-xl text-center">🔔 New Booking!</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Booking Details */}
          <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-lg">{booking.service_type.toUpperCase()}</span>
              <span className="font-bold text-primary text-lg">₹{booking.price_inr}</span>
            </div>
            <div className="text-sm space-y-1">
              <div className="font-medium">{booking.cust_name}</div>
              <div className="text-muted-foreground">
                {booking.community} • #{booking.flat_no}
              </div>
              {booking.notes && (
                <div className="text-sm text-muted-foreground mt-2 p-2 bg-background rounded">
                  {booking.notes}
                </div>
              )}
            </div>
          </div>

          {/* Countdown Timer */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Auto-reject in</span>
              <span className="font-semibold text-destructive">{seconds}s</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              onClick={onReject}
              variant="outline"
              size="lg"
              className="h-12"
            >
              Reject
            </Button>
            <Button
              onClick={onAccept}
              size="lg"
              className="h-12 bg-green-600 hover:bg-green-700"
            >
              Accept
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
