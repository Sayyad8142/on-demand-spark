import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type BookingAlert = {
  id: string;
  service_type: string;
  cust_name: string;
  community: string;
  flat_no: string;
  price_inr: number;
};

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
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">New Booking</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="font-medium">{booking.service_type.toUpperCase()} • ₹{booking.price_inr}</div>
          <div>{booking.cust_name}</div>
          <div>{booking.community} • #{booking.flat_no}</div>
          <div className="text-muted-foreground">Auto-reject in {seconds}s</div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={onAccept}>Accept</Button>
          <Button className="flex-1" variant="outline" onClick={onReject}>Reject</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
