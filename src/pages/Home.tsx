import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { useBookingAlerts } from "@/hooks/useBookingAlerts";
import { useActiveJob } from "@/hooks/useActiveJob";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import AvailabilityToggle from "@/components/AvailabilityToggle";
import BookingAlertModal from "@/components/BookingAlertModal";
import ActiveJobCard from "@/components/ActiveJobCard";
import { Button } from "@/components/ui/button";
import { Calendar, User, LogOut, Loader2, Bell, Settings as SettingsIcon } from "lucide-react";

export default function Home() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading, signOut } = useAuth();
  const { worker, loading: workerLoading, updateAvailability, refetch: refetchWorker } = useWorkerProfile(user?.id);
  const { pendingBooking, clearAlert } = useBookingAlerts(user?.id, worker?.is_available || false);
  const { activeJob, updateJobStatus, loading: jobLoading } = useActiveJob(user?.id);
  const [toggling, setToggling] = useState(false);
  const [updatingJob, setUpdatingJob] = useState(false);
  const [sendingTestNotification, setSendingTestNotification] = useState(false);

  // Listen for push notification messages (from service worker or foreground)

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

  const handleTestNotification = async () => {
    if (!user) return;

    try {
      setSendingTestNotification(true);
      console.log('🔔 Sending test notification to user:', user.id);

      const { data, error } = await supabase.functions.invoke('send-onesignal', {
        body: {
          externalUserIds: [user.id],
          headings: { en: 'Test Push from OneSignal 🔔' },
          contents: { en: 'This is a test notification to verify integration.' },
          data: { type: 'TEST_NOTIFICATION', time: new Date().toISOString() },
        },
      });

      if (error) {
        console.error('❌ Test notification error:', error);
        toast({
          title: "❌ Failed to send notification",
          description: error.message,
          variant: "destructive"
        });
      } else {
        console.log('✅ Test notification sent successfully:', data);
        toast({
          title: "✅ Test notification sent!",
          description: "Check your device for the notification"
        });
      }
    } catch (error: any) {
      console.error('❌ Test notification exception:', error);
      toast({
        title: "❌ Failed to send notification",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSendingTestNotification(false);
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
              onClick={() => navigate("/settings")}
            >
              <SettingsIcon className="w-5 h-5" />
            </Button>
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

        {/* Test Notification Button (Debug) */}
        <div className="bg-yellow-50 dark:bg-yellow-950 border-2 border-yellow-300 dark:border-yellow-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">Debug: Test Notification</h3>
            </div>
          </div>
          <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
            Send a test OneSignal notification to verify push integration
          </p>
          <Button
            onClick={handleTestNotification}
            disabled={sendingTestNotification}
            variant="outline"
            className="w-full border-yellow-400 hover:bg-yellow-100 dark:border-yellow-600 dark:hover:bg-yellow-900"
          >
            {sendingTestNotification ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Bell className="w-4 h-4 mr-2" />
                Send Test Notification
              </>
            )}
          </Button>
        </div>

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
    </div>
  );
}