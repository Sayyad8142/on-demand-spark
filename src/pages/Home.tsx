import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { useBookingAlerts } from "@/hooks/useBookingAlerts";
import { useActiveJob } from "@/hooks/useActiveJob";
import { BookingAlertModal } from "@/components/BookingAlertModal";
import ActiveJobCard from "@/components/ActiveJobCard";
import { AvailabilityToggle } from "@/components/AvailabilityToggle";
import { UpcomingBookingsBar } from "@/components/UpcomingBookingsBar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bell, X, LogOut } from "lucide-react";
import { Capacitor } from '@capacitor/core';
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { DEMO_WORKER, DEMO_ACTIVE_JOB, DEMO_BOOKINGS } from "@/config/demoData";

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;
export default function Home() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, firebaseUser, getAccessToken } = useAuth();
  const { toast } = useToast();
  
  // Check for guest mode
  const isGuestMode = localStorage.getItem('guest_mode') === 'true';
  
  // Use demo data in guest mode, real data otherwise
  const { worker: realWorker, updateAvailability, refetch: refetchWorker } = useWorkerProfile(user?.id);
  const { activeJob: realActiveJob, updateJobStatus, refetch: refetchActiveJob } = useActiveJob(user?.id);
  
  const worker = isGuestMode ? DEMO_WORKER : realWorker;
  const activeJob = isGuestMode ? DEMO_ACTIVE_JOB : realActiveJob;
  
  const [toggling, setToggling] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showWebPushBanner, setShowWebPushBanner] = useState(false);
  const isOnline = !!worker?.is_available;

  // Note: FCM initialization is handled in App.tsx, no need to duplicate here

  // CRITICAL: Ensure JWT is saved on native platform for overlay functionality
  useEffect(() => {
    const ensureJWTSaved = async () => {
      if (!Capacitor.isNativePlatform() || !AuthBridge || !firebaseUser) {
        console.log('⚠️ Not native platform, AuthBridge unavailable, or no user');
        return;
      }
      
      try {
        console.log('🔐 [Home] Getting Firebase ID token...');
        const accessToken = await getAccessToken();
        if (!accessToken) {
          console.log('⚠️ No access token available');
          return;
        }
        
        console.log('🔐 [Home] Verifying JWT in native storage...');

        // Check if JWT exists and matches current token
        const stored = await AuthBridge.getToken();
        if (stored?.token === accessToken) {
          console.log('✅ [Home] JWT already saved correctly');
          return;
        }
        console.log('🔐 [Home] JWT missing or outdated, saving now...');

        // Save with retry logic
        for (let attempt = 1; attempt <= 3; attempt++) {
          await AuthBridge.saveToken({
            token: accessToken
          });
          await new Promise(resolve => setTimeout(resolve, 100));
          const verify = await AuthBridge.getToken();
          if (verify?.token === accessToken) {
            console.log(`✅ [Home] JWT saved successfully on attempt ${attempt}`);
            return;
          }
          console.warn(`❌ [Home] JWT verification failed on attempt ${attempt}`);
        }
        console.error('❌ [Home] Failed to save JWT after 3 attempts');
      } catch (error) {
        console.error('❌ [Home] Error ensuring JWT saved:', error);
      }
    };
    ensureJWTSaved();
  }, [firebaseUser, getAccessToken]);

  // Check if notification permission is default (not granted or denied)
  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      const permission = Notification.permission;
      console.log('📱 Notification permission:', permission);
      if (permission === 'default') {
        setShowWebPushBanner(true);
      }
    }
  }, []);
  const matches = (b: any) => {
    const inService = worker?.service_types?.includes?.(b.service_type);
    const inCommunity = (worker?.communities || [worker?.community]).includes?.(b.community);
    return !!(inService && inCommunity);
  };
  const {
    pending,
    accept,
    reject,
    clearAlert
  } = useBookingAlerts(user?.id, isOnline, matches);
  const handleToggle = async (value: boolean) => {
    if (isGuestMode) {
      toast({
        title: "Guest Mode",
        description: "Create an account to change availability",
        variant: "default",
      });
      return;
    }
    
    setToggling(true);
    await updateAvailability(value);
    setToggling(false);
  };
  
  const handleStatusUpdate = async (status: string) => {
    if (isGuestMode) {
      toast({
        title: "Guest Mode",
        description: "Create an account to update job status",
        variant: "default",
      });
      return;
    }

    setUpdating(true);
    await updateJobStatus(activeJob?.id, status);
    await refetchWorker();
    setUpdating(false);
  };
  
  const handleAccept = async () => {
    if (isGuestMode) {
      toast({
        title: "Guest Mode",
        description: "Create an account to accept real bookings",
        variant: "default",
      });
      return;
    }
    await accept();
    await Promise.all([refetchActiveJob(), refetchWorker()]);
  };

  const handleLogoutFromGuest = () => {
    localStorage.removeItem('guest_mode');
    navigate('/auth');
  };

  // Guard: Don't render if user is not loaded yet in non-guest mode
  if (!user && !isGuestMode) {
    return <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>;
  }
  return <div className="min-h-screen">
      {/* Guest Mode Banner */}
      {isGuestMode && (
        <div className="bg-amber-500/90 text-white px-4 py-3 text-center text-sm font-medium flex items-center justify-center gap-2">
          👀 Exploring in Guest Mode • Create account to receive real bookings
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogoutFromGuest}
            className="text-white hover:text-white/80 hover:bg-white/20"
          >
            <LogOut className="h-4 w-4 mr-1" />
            Exit
          </Button>
        </div>
      )}

      {/* Fixed Availability Toggle */}
      <div className="fixed top-0 left-0 right-0 z-10 bg-background border-b border-border">
        <div className="p-4">
          <AvailabilityToggle workerId={user?.id || 'demo-worker-id'} />
        </div>
      </div>

      {/* Main Content with top padding for fixed header */}
      <div className="p-4 space-y-4 pb-32 pt-28">
        
      {/* Web Push Banner */}
      {showWebPushBanner && <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 relative">
          <button onClick={() => setShowWebPushBanner(false)} className="absolute top-2 right-2 p-1 hover:bg-blue-100 dark:hover:bg-blue-900 rounded">
            <X className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </button>
          <div className="flex items-start gap-3 pr-6">
            <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-sm text-blue-900 dark:text-blue-100 mb-1">
                {t('home.enableWebPush')}
              </h3>
              <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                {t('home.enableWebPushDesc')}
              </p>
              <Button size="sm" onClick={() => {
              setShowWebPushBanner(false);
              navigate('/troubleshoot');
            }} className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs">
                {t('home.enableInSettings')}
              </Button>
            </div>
          </div>
        </Card>}

      {activeJob && <ActiveJobCard booking={activeJob} onStatusUpdate={handleStatusUpdate} updating={updating} />}
      
      {/* Only show in-app modal on web platform; Android uses native overlay */}
      {!Capacitor.isNativePlatform() && <BookingAlertModal open={!!pending} booking={pending} onAccept={handleAccept} onReject={reject} onClose={clearAlert} />}
      </div>

      {/* Upcoming Bookings Bar - only show when no active job */}
      {!activeJob && !isGuestMode && (
        <UpcomingBookingsBar 
          workerId={user?.id}
          communityName={worker?.community}
          serviceTypes={worker?.service_types}
        />
      )}
    </div>;
}