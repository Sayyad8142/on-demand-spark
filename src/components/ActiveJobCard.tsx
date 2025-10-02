import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Home, User, Phone, Check } from "lucide-react";
import { Database } from "@/integrations/supabase/types";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];

interface ActiveJobCardProps {
  booking: Booking;
  onStatusUpdate: (newStatus: string) => Promise<void>;
  updating: boolean;
}

const STATUS_COLORS = {
  'accepted': 'bg-blue-100 text-blue-700 border-blue-200',
  'on_the_way': 'bg-purple-100 text-purple-700 border-purple-200',
  'started': 'bg-green-100 text-green-700 border-green-200'
};

export default function ActiveJobCard({ booking, onStatusUpdate, updating }: ActiveJobCardProps) {
  const statusColor = STATUS_COLORS[booking.status as keyof typeof STATUS_COLORS] || 'bg-secondary';

  // Only show for active bookings (accepted, on_the_way, started)
  if (!['accepted', 'on_the_way', 'started'].includes(booking.status)) return null;

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
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Phone className="w-3.5 h-3.5" />
              <a href={`tel:${booking.cust_phone}`} className="hover:text-primary transition-colors">
                {booking.cust_phone}
              </a>
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="bg-secondary rounded-xl p-3">
          <div className="flex items-start gap-2">
            <MapPin className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">{booking.community}</p>
              <p className="text-sm text-muted-foreground">{booking.flat_no}</p>
            </div>
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