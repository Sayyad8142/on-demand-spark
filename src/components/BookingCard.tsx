import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Calendar, CheckCircle, XCircle, Loader2, User } from 'lucide-react';
import { toast } from 'sonner';
import { tryAccept } from '@/lib/bookingActions';
import { formatBookingAddress, BookingWithAddress } from '@/lib/address';

type Booking = BookingWithAddress;

interface BookingCardProps {
  booking: Booking;
  getStatusColor?: (status: string) => string;
  showActions?: boolean;
  onAccept?: (bookingId: string) => void;
  onReject?: (bookingId: string) => void;
}

export function BookingCard({
  booking,
  getStatusColor,
  showActions = false,
  onAccept,
  onReject,
}: BookingCardProps) {
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const result = await tryAccept(booking.id);
      if (result.success) {
        toast.success('Booking accepted!');
        onAccept?.(booking.id);
      } else {
        toast.error(result.error || 'Booking already taken');
      }
    } catch (error) {
      toast.error('Failed to accept booking');
      console.error('Error accepting booking:', error);
    } finally {
      setAccepting(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    try {
      // TODO: Implement reject endpoint
      toast.info('Booking rejected');
      onReject?.(booking.id);
    } catch (error) {
      toast.error('Failed to reject booking');
      console.error('Error rejecting booking:', error);
    } finally {
      setRejecting(false);
    }
  };

  const defaultGetStatusColor = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-700',
      accepted: 'bg-blue-100 text-blue-700',
      on_the_way: 'bg-purple-100 text-purple-700',
      started: 'bg-green-100 text-green-700',
      completed: 'bg-emerald-100 text-emerald-700',
      cancelled: 'bg-gray-100 text-gray-700',
    };
    return colors[status as keyof typeof colors] || 'bg-secondary';
  };

  const statusColorFn = getStatusColor || defaultGetStatusColor;

  return (
    <Card className="p-4 shadow-card hover:shadow-pink transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1">
          {/* Worker Photo */}
          {booking.worker_name && (
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md border-2 border-white dark:border-gray-800 overflow-hidden flex-shrink-0">
              {booking.worker_photo_url ? (
                <img 
                  src={booking.worker_photo_url} 
                  alt={booking.worker_name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-6 h-6 text-primary-foreground" />
              )}
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg">{booking.cust_name}</h3>
            {booking.worker_name && (
              <p className="text-xs text-muted-foreground font-medium">Worker: {booking.worker_name}</p>
            )}
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="w-3 h-3" />
              {booking.community} • {formatBookingAddress(booking)}
            </div>
          </div>
        </div>
        <Badge className={statusColorFn(booking.status)}>
          {booking.status.replace('_', ' ')}
        </Badge>
      </div>

      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {booking.service_type.replace('_', ' ')}
          </span>
          {booking.price_inr && (
            <span className="font-bold text-primary">₹{booking.price_inr}</span>
          )}
        </div>
        
        {booking.created_at && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Calendar className="w-3 h-3" />
            {new Date(booking.created_at).toLocaleString()}
          </div>
        )}

        {booking.notes && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {booking.notes}
          </p>
        )}
      </div>

      {showActions && booking.status === 'pending' && (
        <div className="flex gap-2 pt-3 border-t">
          <Button
            onClick={handleAccept}
            disabled={accepting || rejecting}
            className="flex-1"
          >
            {accepting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Accept
              </>
            )}
          </Button>
          <Button
            onClick={handleReject}
            disabled={accepting || rejecting}
            variant="outline"
            className="flex-1"
          >
            {rejecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </>
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}
