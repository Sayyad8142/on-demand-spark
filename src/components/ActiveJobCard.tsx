import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Home, User, Check } from "lucide-react";
import { Database } from "@/integrations/supabase/types";
type Booking = Database["public"]["Tables"]["bookings"]["Row"];
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
  const statusColor = STATUS_COLORS[booking.status as keyof typeof STATUS_COLORS] || 'bg-secondary';

  // Don't show for completed or cancelled bookings
  if (!['assigned', 'accepted', 'on_the_way', 'started'].includes(booking.status)) {
    console.log('🚫 ActiveJobCard: Not showing card, status is:', booking.status);
    return null;
  }
  console.log('✅ ActiveJobCard: Showing card, status is:', booking.status);
  return <Card className="shadow-card overflow-hidden">
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-4 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">Active Job</h3>
            
          </div>
          <Badge className={`${statusColor} border`}>
            {booking.status.replace('_', ' ').toUpperCase()}
          </Badge>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* 1. Flat Number Display - First and Highlighted */}
        <div className="bg-gradient-to-br from-primary/5 to-primary/10 border-2 border-primary/30 rounded-2xl p-4 shadow-sm">
          <p className="text-sm font-bold text-center text-primary mb-4">FLAT NO : {booking.flat_no}</p>
          {booking.flat_no && booking.flat_no.toString().length === 4 && <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-xs font-semibold text-muted-foreground mb-2">TOWER</p>
                <div className="bg-white dark:bg-gray-800 rounded-xl py-3 shadow-sm border border-primary/20">
                  <p className="text-2xl font-bold text-primary">{booking.flat_no.toString().charAt(0)}</p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-muted-foreground mb-2">FLOOR</p>
                <div className="bg-white dark:bg-gray-800 rounded-xl py-3 shadow-sm border border-primary/20">
                  <p className="text-2xl font-bold text-primary">{booking.flat_no.toString().substring(1, 3)}</p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-muted-foreground mb-2">DOOR</p>
                <div className="bg-white dark:bg-gray-800 rounded-xl py-3 shadow-sm border border-primary/20">
                  <p className="text-2xl font-bold text-primary">{booking.flat_no.toString().charAt(3)}</p>
                </div>
              </div>
            </div>}
        </div>

        {/* 2. Service and Price */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Home className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Service Type</p>
                <p className="font-bold text-lg capitalize">{booking.service_type.replace('_', ' ')}</p>
              </div>
            </div>
            {booking.price_inr && <div className="text-right">
                <p className="text-xs text-muted-foreground mb-1">Earnings</p>
                <p className="font-bold text-primary text-2xl">₹{booking.price_inr}</p>
              </div>}
          </div>
        </div>

        {/* 3. Customer Name and Community */}
        <div className="bg-card border border-border rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Customer Name</p>
              <p className="font-bold text-base">{booking.cust_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Community</p>
              <p className="font-bold text-base">{booking.community}</p>
            </div>
          </div>
        </div>

        {/* Notes */}
        {booking.notes && <div className="bg-muted/50 border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2">NOTES:</p>
            <p className="text-sm text-foreground">{booking.notes}</p>
          </div>}

        {/* 4. Work Completed Button - Red Color */}
        <Button size="lg" className="w-full h-14 text-base font-bold bg-red-500 hover:bg-red-600 text-white shadow-lg" onClick={() => onStatusUpdate('completed')} disabled={updating}>
          {updating ? "Updating..." : <>
              <Check className="w-5 h-5 mr-2" />
              Work Completed
            </>}
        </Button>
      </div>
    </Card>;
}