import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { useBookingAlerts } from "@/hooks/useBookingAlerts";
import { useActiveJob } from "@/hooks/useActiveJob";
import { usePushSetup } from "@/hooks/usePushSetup";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import AvailabilityToggle from "@/components/AvailabilityToggle";
import BookingAlertModal from "@/components/BookingAlertModal";
import ActiveJobCard from "@/components/ActiveJobCard";
import { Button } from "@/components/ui/button";
import { Calendar, User, LogOut, Loader2 } from "lucide-react";

export default function Home() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading, signOut } = useAuth();
  const { worker, loading: workerLoading, updateAvailability, refetch: refetchWorker } = useWorkerProfile(user?.id);
  const { pendingBooking, clearAlert } = useBookingAlerts(user?.id, worker?.is_available || false);
  const { activeJob, updateJobStatus, loading: jobLoading } = useActiveJob(user?.id);
  const [toggling, setToggling] = useState(false);
  const [updatingJob, setUpdatingJob] = useState(false);
  const [pushBooking, setPushBooking] = useState<any>(null);

  // Setup push notifications
  usePushSetup();

  // Listen for push notification messages (from service worker or foreground)
  useEffect(() => {
    const handlePushMessage = async (event: MessageEvent) => {
      if (event.data?.type === "BOOKING_ALERT" && event.data?.bookingId) {
        const bookingId = event.data.bookingId;
        console.log('Received booking alert for:', bookingId);

        // Fetch the booking details
        try {
          const { data: booking, error } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', bookingId)
            .single();

          if (error) throw error;

          if (booking && worker) {
            // Check if worker matches service/community and is available
            const matchesService = worker.service_types?.includes(booking.service_type);
            const matchesCommunity = 
              worker.communities?.includes(booking.community) ||
              worker.community === booking.community;

            if (matchesService && matchesCommunity && worker.is_available) {
              setPushBooking(booking);
            }
          }
        } catch (error) {
          console.error('Error fetching booking from push:', error);
        }
      }
    };

    window.addEventListener('message', handlePushMessage);
    return () => window.removeEventListener('message', handlePushMessage);
  }, [worker?.id, worker?.is_available, worker?.service_types, worker?.communities, worker?.community]);

  const handlePushBookingClear = () => {
    setPushBooking(null);
  };

  if (authLoading || workerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    navigate("/auth");
    return null;
  }

  if (!worker) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">Worker Profile Not Found</h2>
          <p className="text-muted-foreground">Please contact support</p>
          <Button onClick={signOut}>Sign Out</Button>
        </div>
      </div>
    );
  }

  // Workers are auto-approved on signup

  const handleToggleAvailability = async (value: boolean) => {
    try {
      setToggling(true);
      await updateAvailability(value);
      toast({
        title: value ? "You're now online" : "You're now offline",
        description: value ? "You can receive booking alerts" : "You won't receive new bookings"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setToggling(false);
    }
  };

  const handleJobStatusUpdate = async (newStatus: string) => {
    if (!activeJob) return;

    try {
      setUpdatingJob(true);
      await updateJobStatus(activeJob.id, newStatus);
      
      // Refetch worker profile to ensure UI is in sync (especially is_busy flag)
      await refetchWorker();
      
      if (newStatus === 'completed') {
        toast({
          title: "Job completed!",
          description: `Great work! ₹${activeJob.price_inr} added to your earnings.`
        });
      } else {
        toast({
          title: "Status updated",
          description: `Job status changed to ${newStatus.replace('_', ' ')}`
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setUpdatingJob(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-primary-soft">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Didi Now</h1>
            <p className="text-sm text-muted-foreground">Worker App</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/bookings")}
            >
              <Calendar className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/profile")}
            >
              <User className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto p-4 space-y-6 pb-24">
        {/* Welcome */}
        <div className="text-center py-6">
          <h2 className="text-2xl font-bold mb-2">Welcome, {worker.full_name}!</h2>
          <p className="text-muted-foreground">
            {worker.is_available ? "You're ready to accept jobs" : "Go online to start accepting jobs"}
          </p>
        </div>

        {/* Availability Toggle */}
        <AvailabilityToggle
          isOnline={worker.is_available || false}
          onToggle={handleToggleAvailability}
          disabled={toggling || worker.is_busy}
        />

        {/* Active Job */}
        {activeJob && (
          <ActiveJobCard
            booking={activeJob}
            onStatusUpdate={handleJobStatusUpdate}
            updating={updatingJob}
          />
        )}

        {/* Empty State */}
        {!activeJob && (
          <div className="text-center py-12">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Active Jobs</h3>
            <p className="text-muted-foreground mb-4">
              {worker.is_available 
                ? "Waiting for new bookings..." 
                : "Go online to start receiving jobs"}
            </p>
            <Button
              variant="outline"
              onClick={() => navigate("/bookings")}
            >
              View Booking History
            </Button>
          </div>
        )}
      </main>

      {/* Booking Alert Modal - from realtime subscription */}
      <BookingAlertModal
        booking={pendingBooking}
        onAccept={clearAlert}
        onReject={clearAlert}
      />

      {/* Booking Alert Modal - from push notification */}
      <BookingAlertModal
        booking={pushBooking}
        onAccept={handlePushBookingClear}
        onReject={handlePushBookingClear}
      />
    </div>
  );
}