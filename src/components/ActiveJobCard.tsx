import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Phone } from "lucide-react";
import { BookingWithAddress } from "@/lib/address";
import { parsePHFCode } from "@/lib/address";

type Booking = BookingWithAddress;
interface ActiveJobCardProps {
  booking: Booking;
  onStatusUpdate: (newStatus: string) => Promise<void>;
  updating: boolean;
}

const MANAGER_PHONE = "8008180018";

export default function ActiveJobCard({
  booking,
  onStatusUpdate,
  updating
}: ActiveJobCardProps) {
  // Don't show for completed or cancelled bookings
  if (!['assigned', 'accepted', 'on_the_way', 'started'].includes(booking.status)) {
    console.log('🚫 ActiveJobCard: Not showing card, status is:', booking.status);
    return null;
  }
  console.log('✅ ActiveJobCard: Showing card, status is:', booking.status);
  
  const phfParsed = parsePHFCode(booking.flat_no);

  const handleCallManager = () => {
    window.location.href = `tel:${MANAGER_PHONE}`;
  };
  
  return <Card className="shadow-lg overflow-hidden border-0">
      <div className="p-4 space-y-3">
        {/* 1. Flat Number Display - Wooden Door Style */}
        <div className="flat-door-style p-5">
          <div className="text-center mb-4 relative z-10">
            <p className="flat-number-text font-extrabold text-3xl tracking-wide uppercase">
              Flat {booking.flat_no}
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

        {/* 3. Call Manager Button */}
        <Button 
          size="lg" 
          className="w-full h-12 text-base font-bold bg-green-500 hover:bg-green-600 text-white shadow-md rounded-xl transition-all duration-200 active:scale-[0.98]" 
          onClick={handleCallManager}
        >
          <Phone className="w-5 h-5 mr-2" />
          Call Manager
        </Button>

        {/* 4. Work Completed Button */}
        <Button 
          size="lg" 
          className="w-full h-14 text-lg font-bold bg-red-500 hover:bg-red-600 text-white shadow-lg rounded-xl transition-all duration-200 active:scale-[0.98]" 
          onClick={() => onStatusUpdate('completed')} 
          disabled={updating}
        >
          {updating ? "Updating..." : <>
              <Check className="w-6 h-6 mr-2" />
              Work Completed
            </>}
        </Button>
      </div>
    </Card>;
}
