import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { useUnifiedBookingAlerts } from "@/hooks/useUnifiedBookingAlerts";
import { useActiveJob } from "@/hooks/useActiveJob";
import { useEnhancedHeartbeat } from "@/hooks/useEnhancedHeartbeat";
import { useBookingRequestsRealtime } from "@/hooks/useBookingRequestsRealtime";
import { useBookingPollingFallback } from "@/hooks/useBookingPollingFallback";
import { usePushHealthGuard } from "@/hooks/usePushHealthGuard";
import { useAutoHeal } from "@/hooks/useAutoHeal";
import { useWorkerHealth } from "@/hooks/useWorkerHealth";
import { useStartupHealthAudit } from "@/hooks/useStartupHealthAudit";
import { WorkerHealthBadge } from "@/components/WorkerHealthBadge";
import HomePerformanceCard from "@/components/HomePerformanceCard";
import WorkerLeaderboardCard from "@/components/WorkerLeaderboardCard";

import ActiveJobCard from "@/components/ActiveJobCard";
import { AvailabilityToggle } from "@/components/AvailabilityToggle";
import { UpcomingBookingsBar } from "@/components/UpcomingBookingsBar";
// Notification health banners removed — token repair is fully automatic via useAutoPushRepair.
import { OnboardingChecklist, useOnboardingStatus } from "@/components/OnboardingChecklist";
import { NotificationsOffDialog } from "@/components/NotificationsOffDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bell, X, LogOut, AlertTriangle, RefreshCw, ShieldAlert, Clock } from "lucide-react";
import { Capacitor } from '@capacitor/core';
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { DEMO_WORKER, DEMO_ACTIVE_JOB, DEMO_BOOKINGS } from "@/config/demoData";
// Movement monitoring is owned by App.tsx — no imports needed here.

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

  // Startup health audit (silent) — one-shot on cold launch
  useStartupHealthAudit(isGuestMode ? undefined : user?.id);

  // Unified Worker Health Engine
  const workerHealth = useWorkerHealth(isGuestMode ? undefined : worker?.id, pushHealth);

  // Auto-heal missing data (service_types, availability slots)
  useAutoHeal(isGuestMode ? undefined : worker?.id, isGuestMode ? null : worker);

  // Enhanced heartbeat: 45s interval with device info + pending booking fallback
  const isOnline = !!worker?.is_available;
  useEnhancedHeartbeat(isGuestMode ? undefined : worker?.id, isOnline);

  // Layer 2: Realtime subscription on booking_requests
  useBookingRequestsRealtime(isGuestMode ? undefined : worker?.id, isOnline && payoutReady);

  // Layer 3: Server-side polling fallback (10s foreground / 30s background)
  useBookingPollingFallback(isGuestMode ? undefined : worker?.id, isOnline && payoutReady);
  
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
  } = useUnifiedBookingAlerts(user?.id, isOnline && payoutReady, matches, worker?.id);

  // Movement tracking lifecycle is owned globally by App.tsx (useActiveJob-driven)
  // so it keeps running when the worker navigates to Profile/Bookings/Availability.
  // Do NOT start/stop monitoring from Home — that caused tracking to die on nav.

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
              onPayoutRequired={() => navigate('/account-details')}
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
              hasAvailabilitySlots={onboarding.hasAvailabilitySlots}
              onNoSlots={() => navigate('/availability')}
            />
          </div>
        </div>
      )}


      {/* Main Content with top padding for fixed header */}
      <div className={`p-4 space-y-4 pb-32 ${isGuestMode ? 'pt-4' : 'pt-28'}`}>

      {/* Worker Health badge — unified status from all signals */}
      {!isGuestMode && worker && workerHealth.status !== "ready" && (
        <WorkerHealthBadge
          health={workerHealth}
          onRepair={async () => {
            if (pushHealth.isChecking) return;
            const ok = await pushHealth.repair();
            toast({
              title: ok ? "Booking alerts restored" : "Still unable to restore",
              description: ok
                ? "You're ready to receive bookings."
                : "Please open Device Readiness to fix remaining issues.",
              variant: ok ? "default" : "destructive",
            });
            if (!ok) navigate("/device-readiness");
          }}
        />
      )}

      {!isGuestMode && worker && !activeJob && (
        <HomePerformanceCard
          priorityScore={(worker as any)?.priority_score}
          rating={(worker as any)?.admin_override_rating ?? worker?.rating}
          totalRatings={(worker as any)?.total_ratings}
        />
      )}

      {!isGuestMode && worker && !activeJob && (
        <WorkerLeaderboardCard 
          currentWorkerId={worker.id}
          community={worker.community || ""}
          serviceTypes={worker.service_types || []}
          isAvailable={!!worker.is_available}
        />
      )}

      {!isGuestMode && worker && !payoutReady && (
        <Card className="p-5 border-2 border-primary/30 bg-primary/5 shadow-sm">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="font-semibold text-base text-foreground">
                  Complete payout details to start getting bookings
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  You won’t receive bookings until payout details are added.
                </p>
              </div>
            </div>
            <Button className="w-full h-11" onClick={() => navigate('/account-details')}>
              Add payout details
            </Button>
          </div>
        </Card>
      )}

      {/* Onboarding Checklist */}
      {!isGuestMode && worker && (
        <div id="onboarding-checklist">
          <OnboardingChecklist
            workerId={worker.id}
            worker={worker}
          />
        </div>
      )}

      {/* Push health self-heals silently. Only after 3+ failed auto-repairs do we show worker-friendly guidance. */}
      {Capacitor.isNativePlatform() && !isGuestMode && ((worker as any)?.notification_repair_failures ?? 0) >= 3 && (
        <NotificationsOffDialog
          onRetry={async () => {
            const ok = await pushHealth.repair();
            toast({
              title: ok ? "Notifications enabled" : "Still unable to enable",
              description: ok
                ? "You'll start receiving booking requests."
                : "Please enable notifications in your phone settings.",
              variant: ok ? "default" : "destructive",
            });
            return ok;
          }}
        />
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

      {/* Notification/token health self-heals silently — no worker-facing banner. */}


      {/* Upcoming Bookings Bar */}
      {!isGuestMode && worker && <UpcomingBookingsBar />}

      {/* Block bookings if no time slots selected */}
      {!isGuestMode && worker && !onboarding.hasAvailabilitySlots && (
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="flex items-center justify-center mb-2">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
              </div>
              <AlertDialogTitle className="text-center">Select slot to start bookings</AlertDialogTitle>
              <AlertDialogDescription className="text-center">
                You haven't selected any time slots. Please choose your available hours to start receiving bookings.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => navigate('/availability')} className="w-full">
                Set my time slots
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>;
}