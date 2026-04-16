import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { useUnifiedBookingAlerts } from "@/hooks/useUnifiedBookingAlerts";
import { useActiveJob } from "@/hooks/useActiveJob";
import { useEnhancedHeartbeat } from "@/hooks/useEnhancedHeartbeat";
import { useBookingRequestsRealtime } from "@/hooks/useBookingRequestsRealtime";
import { usePushHealthGuard } from "@/hooks/usePushHealthGuard";
import { useAutoHeal } from "@/hooks/useAutoHeal";

import ActiveJobCard from "@/components/ActiveJobCard";
import { AvailabilityToggle } from "@/components/AvailabilityToggle";
import { UpcomingBookingsBar } from "@/components/UpcomingBookingsBar";
import { OnboardingChecklist, useOnboardingStatus } from "@/components/OnboardingChecklist";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bell, X, LogOut, AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
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
  const { user, session } = useAuth();
  const { toast } = useToast();
  
  // Check for guest mode
  const isGuestMode = localStorage.getItem('guest_mode') === 'true';
  
  // Use demo data in guest mode, real data otherwise
  const { worker: realWorker, loading: workerLoading, updateAvailability, refetch: refetchWorker } = useWorkerProfile(user?.id);
  const { activeJob: realActiveJob, updateJobStatus, refetch: refetchActiveJob } = useActiveJob(user?.id);
  
  const worker = isGuestMode ? DEMO_WORKER : realWorker;
  const activeJob = isGuestMode ? null : realActiveJob;

  const payoutReady = isGuestMode ? true : workerLoading ? true : !!(worker as any)?.payout_ready;

  // Onboarding status: checks service_types, community, availability slots
  const onboarding = useOnboardingStatus(
    isGuestMode ? undefined : worker?.id,
    isGuestMode ? null : worker
  );

  // Push health guard: mandatory token validation
  const pushHealth = usePushHealthGuard(isGuestMode ? undefined : user?.id);

  // Enhanced heartbeat: 45s interval with device info + pending booking fallback
  const isOnline = !!worker?.is_available;
  useEnhancedHeartbeat(isGuestMode ? undefined : worker?.id, isOnline);

  // Layer 2: Realtime subscription on booking_requests
  useBookingRequestsRealtime(isGuestMode ? undefined : worker?.id, isOnline);
  
  const [toggling, setToggling] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showWebPushBanner, setShowWebPushBanner] = useState(false);

  // Note: FCM initialization is handled in App.tsx, no need to duplicate here

  // CRITICAL: Ensure JWT is saved on native platform for overlay functionality
  useEffect(() => {
    const ensureJWTSaved = async () => {
      if (!Capacitor.isNativePlatform() || !AuthBridge) {
        console.log('⚠️ Not native platform or AuthBridge unavailable');
        return;
      }
      if (!session?.access_token) {
        console.log('⚠️ No session or access token available');
        return;
      }
      try {
        console.log('🔐 [Home] Verifying JWT in native storage...');

        // Check if JWT exists and matches current session
        const stored = await AuthBridge.getToken();
        if (stored?.token === session.access_token) {
          console.log('✅ [Home] JWT already saved correctly');
          return;
        }
        console.log('🔐 [Home] JWT missing or outdated, saving now...');

        // Save with retry logic
        for (let attempt = 1; attempt <= 3; attempt++) {
          await AuthBridge.saveToken({
            token: session.access_token
          });
          await new Promise(resolve => setTimeout(resolve, 100));
          const verify = await AuthBridge.getToken();
          if (verify?.token === session.access_token) {
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
  }, [session]);

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
  } = useUnifiedBookingAlerts(user?.id, isOnline, matches, worker?.id);
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

      {/* Fixed Availability Toggle - Hidden in guest mode */}
      {!isGuestMode && (
        <div className="fixed top-0 left-0 right-0 z-20 bg-background border-b border-border" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 24px)' }}>
          <div className="p-2 px-4">
            <AvailabilityToggle
              workerId={worker?.id || user?.id || 'demo-worker-id'}
              payoutReady={payoutReady}
              onPayoutRequired={() => navigate('/profile')}
              pushHealthy={pushHealth.isHealthy}
              onPushUnhealthy={async () => {
                if (pushHealth.isChecking) {
                  toast({
                    title: 'Preparing booking alerts',
                    description: 'Please wait while the app restores push notifications in the background.',
                  });
                  return;
                }

                const ok = await pushHealth.repair();
                if (ok) {
                  toast({ title: "Booking alerts restored", description: "You can now go online." });
                } else {
                  toast({
                    title: 'Booking alerts still unavailable',
                    description: 'Please enable notifications and try the backup refresh again.',
                    variant: 'destructive',
                  });
                }
              }}
              onboardingComplete={onboarding.isComplete}
              onOnboardingIncomplete={() => {
                // Scroll to onboarding checklist
                const el = document.getElementById('onboarding-checklist');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
            />
          </div>
        </div>
      )}

      {/* Main Content with top padding for fixed header */}
      <div className={`p-4 space-y-4 pb-32 ${isGuestMode ? 'pt-4' : 'pt-28'}`}>

      {/* Onboarding Checklist */}
      {!isGuestMode && worker && !onboarding.isComplete && (
        <div id="onboarding-checklist">
          <OnboardingChecklist
            workerId={worker.id}
            worker={worker}
          />
        </div>
      )}

      {/* Payout Setup Warning Banner */}
      {!isGuestMode && !payoutReady && (
        <Card className="p-4 bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-700">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-sm text-amber-900 dark:text-amber-100 mb-1">
                Payout setup pending
              </h3>
              <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                Complete payout setup to receive payments. You can still receive bookings.
              </p>
              <Button
                size="sm"
                onClick={() => navigate('/profile')}
                className="bg-amber-600 hover:bg-amber-700 text-white h-8 text-xs"
              >
                Complete Payout Setup
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Push Health Status Banner */}
      {Capacitor.isNativePlatform() && !isGuestMode && !pushHealth.isHealthy && pushHealth.isChecking && (
        <Card className="p-4 bg-muted/50 border-border">
          <div className="flex items-start gap-3">
            <RefreshCw className="w-5 h-5 text-primary flex-shrink-0 mt-0.5 animate-spin" />
            <div className="flex-1">
              <h3 className="font-semibold text-sm text-foreground mb-1">
                Preparing booking alerts…
              </h3>
              <p className="text-xs text-muted-foreground">
                {pushHealth.repairAttempt > 0
                  ? `Automatic repair attempt ${pushHealth.repairAttempt}/${pushHealth.repairMaxAttempts} is running in the background.`
                  : 'Checking notification permission, refreshing token, and syncing booking alerts automatically.'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {Capacitor.isNativePlatform() && !isGuestMode && !pushHealth.isHealthy && !pushHealth.isChecking && pushHealth.manualRepairRequired && (
        <Card className="p-4 bg-destructive/10 border-2 border-destructive">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-sm text-destructive mb-1">
                Booking alerts are not active
              </h3>
              <p className="text-xs text-muted-foreground mb-1">
                {!pushHealth.permissionGranted
                  ? "Notification permission is not granted. Please enable it in settings."
                  : !pushHealth.tokenExists
                  ? "Push token is still missing after automatic retries. Use the backup refresh below."
                  : !pushHealth.tokenSyncedToBackend
                  ? "Token could not be synced to the server automatically. Use the backup refresh below."
                  : "Token is marked invalid and auto-repair did not recover it yet."}
              </p>
              {pushHealth.lastError && (
                <p className="text-xs text-destructive/70 mb-2">Error: {pushHealth.lastError}</p>
              )}
              <Button
                size="sm"
                variant="destructive"
                disabled={pushHealth.isChecking}
                onClick={async () => {
                  const ok = await pushHealth.repair();
                  toast({
                    title: ok ? "Booking alerts restored ✅" : "Repair failed ❌",
                    description: ok ? "You can now go online and receive bookings." : "Please try again or restart the app.",
                    variant: ok ? "default" : "destructive",
                  });
                }}
                className="h-8 text-xs"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${pushHealth.isChecking ? 'animate-spin' : ''}`} />
                {pushHealth.isChecking ? "Refreshing..." : "Refresh Booking Alerts"}
              </Button>
            </div>
          </div>
        </Card>
      )}
        
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

      {activeJob && <ActiveJobCard booking={activeJob} onStatusUpdate={handleStatusUpdate} updating={updating} onRefresh={refetchActiveJob} />}
      
      {/* Guest Mode Logout Button - Big Red */}
      {isGuestMode && (
        <Button
          variant="destructive"
          size="lg"
          onClick={handleLogoutFromGuest}
          className="w-full py-6 text-lg"
        >
          <LogOut className="h-5 w-5 mr-2" />
          {t('common.logout', 'Logout')}
        </Button>
      )}
      
      </div>

      {/* Upcoming Bookings Bar */}
      {!isGuestMode && worker && <UpcomingBookingsBar />}
    </div>;
}