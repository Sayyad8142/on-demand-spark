import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, User, IndianRupee, Clock } from "lucide-react";
import { formatBookingAddress, BookingWithAddress } from "@/lib/address";

type BookingAlert = BookingWithAddress;

export function BookingAlertModal({
  open,
  booking,
  onAccept,
  onReject,
  onClose,
}: {
  open: boolean;
  booking: BookingAlert | null;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  const [seconds, setSeconds] = useState(30);

  useEffect(() => {
    if (!open) return;
    setSeconds(30);
    // play sound
    const audio = new Audio("/sounds/booking_alert.mp3");
    audio.play().catch(() => {});
    const t = setInterval(() => setSeconds(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (open && seconds === 0) onReject();
  }, [open, seconds, onReject]);

  if (!booking) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md rounded-3xl border-0 shadow-2xl p-0 gap-0">
        {/* Header with service type and badge */}
        <div className="bg-primary/10 px-6 py-4 rounded-t-3xl">
          <h2 className="text-2xl font-bold text-center">New Booking</h2>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="text-2xl">{booking.service_type === 'bathroom_cleaning' ? '🧼' : '🧹'}</span>
            <p className="text-lg font-semibold text-primary capitalize">
              {booking.service_type === 'bathroom_cleaning' ? 'Bathroom Cleaning' : 'Maid Service'}
            </p>
          </div>
          <div className="flex justify-center mt-2">
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
              booking.service_type === 'bathroom_cleaning' 
                ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300' 
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
            }`}>
              {booking.service_type === 'bathroom_cleaning' ? '🧼 Deep Cleaning' : '⚡ Instant Booking'}
            </span>
          </div>
        </div>

        {/* Price - Large and prominent */}
        <div className="px-6 py-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950">
          <div className="flex items-center justify-center gap-2">
            <IndianRupee className="w-8 h-8 text-green-600 dark:text-green-400" />
            <span className="text-5xl font-bold text-green-600 dark:text-green-400">
              {booking.price_inr}
            </span>
          </div>
        </div>

        {/* Booking details */}
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-xl">
            <User className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <span className="font-medium">{booking.cust_name}</span>
          </div>
          
          <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-xl">
            <MapPin className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1">
              <div className="font-medium">{booking.community}</div>
              <div className="text-sm text-muted-foreground">{formatBookingAddress(booking)}</div>
            </div>
          </div>

          {/* Countdown timer */}
          <div className="flex items-center justify-center gap-2 p-3 bg-orange-50 dark:bg-orange-950 rounded-xl">
            <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
              Auto-reject in {seconds}s
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-6 pb-6 pt-2 flex gap-3">
          <Button 
            className="flex-1 h-14 text-lg font-semibold rounded-xl" 
            variant="destructive"
            onClick={onReject}
          >
            Reject
          </Button>
          <Button 
            className="flex-1 h-14 text-lg font-semibold rounded-xl bg-green-600 hover:bg-green-700 text-white" 
            onClick={onAccept}
          >
            Accept
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
