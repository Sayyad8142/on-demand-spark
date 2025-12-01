import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Home, User, Check, ChevronDown } from "lucide-react";
import { Database } from "@/integrations/supabase/types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import { formatBookingAddress, parsePHFCode, BookingWithAddress } from "@/lib/address";

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
export default function ActiveJobCard({
  booking,
  onStatusUpdate,
  updating
}: ActiveJobCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const statusColor = STATUS_COLORS[booking.status as keyof typeof STATUS_COLORS] || 'bg-secondary';

  // Don't show for completed or cancelled bookings
  if (!['assigned', 'accepted', 'on_the_way', 'started'].includes(booking.status)) {
    console.log('🚫 ActiveJobCard: Not showing card, status is:', booking.status);
    return null;
  }
  console.log('✅ ActiveJobCard: Showing card, status is:', booking.status);
  
  const formattedAddress = formatBookingAddress(booking);
  const phfParsed = parsePHFCode(booking.flat_no);
  // Extract block/building name from community or booking data
  const blockName = booking.community?.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ') || null;
  
  return <Card className="shadow-lg overflow-hidden border-0">
      <div className="p-4 space-y-3">
        {/* 1. Flat Number Display */}
        <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
          <p className="font-extrabold text-center text-green-500 mb-4 text-2xl tracking-tight">{formattedAddress}</p>
          {phfParsed && <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-2 tracking-wider">BLOCK</p>
                <div className="bg-white dark:bg-gray-800 rounded-xl py-4 shadow-md border-2 border-gray-100 dark:border-gray-700">
                  <p className="text-2xl font-extrabold text-green-500 truncate px-1">{blockName || '-'}</p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-2 tracking-wider">TOWER</p>
                <div className="bg-white dark:bg-gray-800 rounded-xl py-4 shadow-md border-2 border-gray-100 dark:border-gray-700">
                  <p className="text-3xl font-extrabold text-green-500">{phfParsed.tower}</p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-2 tracking-wider">FLOOR</p>
                <div className="bg-white dark:bg-gray-800 rounded-xl py-4 shadow-md border-2 border-gray-100 dark:border-gray-700">
                  <p className="text-3xl font-extrabold text-green-500">{phfParsed.floor}</p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-2 tracking-wider">DOOR</p>
                <div className="bg-white dark:bg-gray-800 rounded-xl py-4 shadow-md border-2 border-gray-100 dark:border-gray-700">
                  <p className="text-3xl font-extrabold text-green-500">{phfParsed.door}</p>
                </div>
              </div>
            </div>}
        </div>

        {/* 2. Earnings */}
        {booking.price_inr && <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Earnings</p>
            <p className="font-bold text-green-500 text-2xl">₹{booking.price_inr}</p>
          </div>
          </div>}

        {/* 3. Customer Details - Dropdown */}
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between h-12 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
              <span className="font-semibold text-base">Customer Details</span>
              <ChevronDown className={`w-5 h-5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3 mt-2 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Customer Name</p>
                  <p className="font-semibold text-base text-gray-900 dark:text-gray-100 truncate">{booking.cust_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Community</p>
                  <p className="font-semibold text-base text-gray-900 dark:text-gray-100 truncate">{booking.community}</p>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Notes */}
        {booking.notes && <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-400 mb-2">NOTES:</p>
            <p className="text-sm text-amber-900 dark:text-amber-200">{booking.notes}</p>
          </div>}

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