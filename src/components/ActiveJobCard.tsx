import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Clock, Phone } from "lucide-react";
import { formatBookingAddress, parsePHFCode, BookingWithAddress } from "@/lib/address";
import { useState, useEffect, useCallback } from "react";

type Booking = BookingWithAddress;

interface ActiveJobCardProps {
  booking: Booking;
  onStatusUpdate: (newStatus: string) => Promise<void>;
  updating: boolean;
}

const STATUS_COLORS = {
  'assigned': 'bg-blue-100 text-blue-700 border-blue-200',
  'accepted': 'bg-blue-100 text-blue-700 border-blue-200',
  'on_the_way': 'bg-purple-100 text-purple-700 border-purple-200',
  'started': 'bg-green-100 text-green-700 border-green-200'
};

const LOCK_DURATION_MINUTES = 20;

function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function ActiveJobCard({
  booking,
  onStatusUpdate,
  updating
}: ActiveJobCardProps) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const statusColor = STATUS_COLORS[booking.status as keyof typeof STATUS_COLORS] || 'bg-secondary';

  // Calculate remaining lock time
  const calculateRemainingSeconds = useCallback(() => {
    // Use accepted_at if available, fallback to created_at
    const baseTime = booking.accepted_at || booking.created_at;
    if (!baseTime) return 0;
    
    const unlockTime = new Date(baseTime).getTime() + (LOCK_DURATION_MINUTES * 60 * 1000);
    const now = Date.now();
    const remaining = Math.max(0, Math.floor((unlockTime - now) / 1000));
    return remaining;
  }, [booking.accepted_at, booking.created_at]);

  // Initialize and update countdown
  useEffect(() => {
    // Initial calculation
    setRemainingSeconds(calculateRemainingSeconds());

    // Only run interval if there's remaining time
    const initialRemaining = calculateRemainingSeconds();
    if (initialRemaining <= 0) return;

    const interval = setInterval(() => {
      const remaining = calculateRemainingSeconds();
      setRemainingSeconds(remaining);
      
      // Clear interval when countdown reaches 0
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [calculateRemainingSeconds]);

  // Don't show for completed or cancelled bookings
  if (!['assigned', 'accepted', 'on_the_way', 'started'].includes(booking.status)) {
    console.log('🚫 ActiveJobCard: Not showing card, status is:', booking.status);
    return null;
  }
  console.log('✅ ActiveJobCard: Showing card, status is:', booking.status);
  
  const phfParsed = parsePHFCode(booking.flat_no);
  const isLocked = remainingSeconds > 0;
  const isButtonDisabled = updating || isLocked;
  
  return <Card className="shadow-lg overflow-hidden border-0">
      <div className="p-4 space-y-3">
        {/* 1. Flat Number Display - Wooden Door Style */}
        <div className="flat-door-style p-5">
          <div className="text-center mb-3 relative z-10">
            <p className="flat-number-text font-bold text-2xl tracking-wide uppercase">
              Flat no {booking.flat_no}
            </p>
          </div>
          {phfParsed && (
            <div className="grid grid-cols-3 gap-3 relative z-10">
              <div className="text-center">
                <p className="text-[10px] font-bold text-[#D6B88A] mb-2 tracking-wider">TOWER</p>
                <div className="bg-[#5A3423] rounded-xl py-4 shadow-inner border-2 border-[#D6B88A]/50">
                  <p className="text-3xl font-extrabold flat-number-text">{phfParsed.tower}</p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-[#D6B88A] mb-2 tracking-wider">FLOOR</p>
                <div className="bg-[#5A3423] rounded-xl py-4 shadow-inner border-2 border-[#D6B88A]/50">
                  <p className="text-3xl font-extrabold flat-number-text">{phfParsed.floor}</p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-[#D6B88A] mb-2 tracking-wider">DOOR</p>
                <div className="bg-[#5A3423] rounded-xl py-4 shadow-inner border-2 border-[#D6B88A]/50">
                  <p className="text-3xl font-extrabold flat-number-text">{phfParsed.door}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. Earnings */}
        {booking.price_inr && <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Earnings</p>
            <p className="font-bold text-green-500 text-2xl">₹{booking.price_inr}</p>
          </div>
          </div>}


        {/* Notes */}
        {booking.notes && <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-400 mb-2">NOTES:</p>
            <p className="text-sm text-amber-900 dark:text-amber-200">{booking.notes}</p>
          </div>}


        {/* 4. Work Completed Button */}
        <Button 
          size="lg" 
          className={`w-full h-14 text-lg font-bold shadow-lg rounded-xl transition-all duration-200 active:scale-[0.98] ${
            isLocked 
              ? 'bg-gray-400 hover:bg-gray-400 cursor-not-allowed text-white' 
              : 'bg-red-500 hover:bg-red-600 text-white'
          }`}
          onClick={() => onStatusUpdate('completed')} 
          disabled={isButtonDisabled}
        >
          {updating ? (
            "Updating..."
          ) : isLocked ? (
            <>
              <Clock className="w-5 h-5 mr-2" />
              Work Completed ({formatCountdown(remainingSeconds)})
            </>
          ) : (
            <>
              <Check className="w-6 h-6 mr-2" />
              Work Completed
            </>
          )}
        </Button>

        {/* 5. Call Manager Button */}
        <Button
          variant="outline"
          size="lg"
          className="w-full h-12 text-base font-medium rounded-xl border-2 border-primary text-primary hover:bg-primary/10"
          onClick={() => window.open('tel:+918008180018', '_self')}
        >
          <Phone className="w-5 h-5 mr-2" />
          Call Manager
        </Button>
      </div>
    </Card>;
}
