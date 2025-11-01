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

export default function ActiveJobCard({ booking, onStatusUpdate, updating }: ActiveJobCardProps) {
  const statusColor = STATUS_COLORS[booking.status as keyof typeof STATUS_COLORS] || 'bg-secondary';

  // Don't show for completed or cancelled bookings
  if (!['assigned', 'accepted', 'on_the_way', 'started'].includes(booking.status)) {
    console.log('🚫 ActiveJobCard: Not showing card, status is:', booking.status);
    return null;
  }

  console.log('✅ ActiveJobCard: Showing card, status is:', booking.status);

  return (
    <Card className="shadow-card overflow-hidden">
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-4 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">Active Job</h3>
            <p className="text-sm text-muted-foreground">Current booking in progress</p>
          </div>
          <Badge className={`${statusColor} border`}>
            {booking.status.replace('_', ' ').toUpperCase()}
          </Badge>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Customer Info */}
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <User className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-lg">{booking.cust_name}</p>
          </div>
        </div>

        {/* Location */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-5 h-5 text-primary" />
            <p className="font-semibold">{booking.community}</p>
          </div>
          
          {/* Flat Number Display */}
          <div className="bg-card border-2 border-primary/20 rounded-xl p-3 text-center">
            <p className="text-xs font-medium text-muted-foreground mb-1">FLAT NO :</p>
            <p className="text-2xl font-bold text-foreground mb-2">{booking.flat_no}</p>
            {booking.flat_no && booking.flat_no.toString().length === 4 && (
              <p className="text-sm font-medium text-muted-foreground">
                Tower {booking.flat_no.toString().charAt(0)} <span className="text-primary">•</span> Floor {booking.flat_no.toString().substring(1, 3)} <span className="text-primary">•</span> Door {booking.flat_no.toString().charAt(3)}
              </p>
            )}
          </div>
        </div>

        {/* Service Details */}
        <div className="flex items-center gap-3">
          <Home className="w-5 h-5 text-primary" />
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Service</p>
            <p className="font-medium">{booking.service_type.replace('_', ' ')}</p>
          </div>
          {booking.price_inr && (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Earnings</p>
              <p className="font-bold text-primary text-lg">₹{booking.price_inr}</p>
            </div>
          )}
        </div>

        {/* Notes */}
        {booking.notes && (
          <div className="text-sm bg-muted p-3 rounded-lg">
            <p className="font-medium mb-1">Notes:</p>
            <p className="text-muted-foreground">{booking.notes}</p>
          </div>
        )}

        {/* Action Button */}
        <Button
          size="lg"
          className="w-full h-14 text-base font-semibold"
          onClick={() => onStatusUpdate('completed')}
          disabled={updating}
        >
          {updating ? (
            "Updating..."
          ) : (
            <>
              <Check className="w-5 h-5 mr-2" />
              Work Completed
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}