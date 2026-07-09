import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/hooks/useAuth";
import { useAutoPushRepair } from "@/hooks/useAutoPushRepair";
import { usePostBootVerification } from "@/hooks/usePostBootVerification";
import { usePermissionRegressionWatch } from "@/hooks/usePermissionRegressionWatch";
import { useFCMTokenSync } from "@/hooks/useFCMTokenSync";
import { useAppState } from "@/hooks/useAppState";
import { useWorkerHeartbeat } from "@/hooks/useWorkerHeartbeat";
import { useForceUpdateCheck } from "@/hooks/useForceUpdateCheck";
import { SoftUpdatePrompt } from "@/components/SoftUpdatePrompt";
import { initNativePush } from "@/native/push";
import { tryAccept } from "@/lib/bookingActions";
import {
  checkBatteryState,
  checkNotificationPermission,
  checkOverlayState,
  requestActivity,
  requestBatteryExemption,
  requestNotificationPermission,
} from "@/lib/permissions";
// requestLocationPermissions intentionally not imported — see startup effect note below.
import { initOtaCheck, markOtaBootSuccess, type UpdateCheckResult } from "@/lib/liveUpdate";
import { startCancellationVoice, stopCancellationVoice } from "@/lib/cancellationVoice";
import { startOtpReminderVoice, stopOtpReminderVoice } from "@/lib/otpReminderVoice";
import { useOtpReminderEscalation, logOtpReminderEvent } from "@/hooks/useOtpReminderEscalation";
import { OtaMandatoryModal } from "@/components/OtaMandatoryModal";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import Auth from "./pages/Auth";
import OtpVerify from "./pages/OtpVerify";
import Home from "./pages/Home";
import Bookings from "./pages/Bookings";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Troubleshoot from "./pages/Troubleshoot";
import VerifyPush from "./pages/VerifyPush";
import DevCacheReset from "./pages/DevCacheReset";
import NotFound from "./pages/NotFound";
import Availability from "./pages/Availability";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import ContactSupport from "./pages/ContactSupport";
import ForceUpdateScreen from "./pages/ForceUpdateScreen";
import CustomerReviews from "./pages/CustomerReviews";
import AdminUploadQr from "./pages/AdminUploadQr";
import AdminTokenHealth from "./pages/AdminTokenHealth";
import AdminPriorityShadow from "./pages/AdminPriorityShadow";
import AdminDispatchTelemetry from "./pages/AdminDispatchTelemetry";
import AuthDebug from "./pages/AuthDebug";
import Earnings from "./pages/Earnings";
import WorkerBlocked from "./pages/WorkerBlocked";
import DeviceReadiness from "./pages/DeviceReadiness";
import BookingDiagnostics from "./pages/BookingDiagnostics";
import CompleteBooking from "./pages/CompleteBooking";
import AccountDetails from "./pages/AccountDetails";
import BatteryOnboarding from "./pages/BatteryOnboarding";
import BottomNav from "./components/BottomNav";
import PermissionOnboarding from "./components/PermissionOnboarding";
import OtpPendingBanner from "./components/OtpPendingBanner";
import {
  startMovementMonitoring,
  stopMovementMonitoring,
  startPassiveMovementMonitoring,
  stopPassiveMovementMonitoring,
  isPassiveMonitoringActive,
} from "@/lib/stepMonitoring";
import { useActiveJob } from "@/hooks/useActiveJob";
import { VoiceAssistantProvider, useVoiceAssistant } from "@/contexts/VoiceAssistantContext";
import VoiceAssistantFAB from "@/components/voice/VoiceAssistantFAB";
import VoiceAssistantSheet from "@/components/voice/VoiceAssistantSheet";
import { useVoiceBookingAnnouncements } from "@/hooks/useVoiceBookingAnnouncements";
import { useMorningBriefing } from "@/hooks/useMorningBriefing";
import { useEveningSummary } from "@/hooks/useEveningSummary";
import { useIdleTips } from "@/hooks/useIdleTips";
import GuidedTour, { tourAlreadyCompleted, markTourCompleted } from "@/components/voice/GuidedTour";

function FirstTimeTourMount() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!user) return;
    if (tourAlreadyCompleted()) return;
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, [user]);
  return <GuidedTour open={open} onFinish={() => { markTourCompleted(); setOpen(false); }} />;
}


const queryClient = new QueryClient();

function StartupSplash({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, showNav = false }: { children: React.ReactNode; showNav?: boolean }) {
  const { user, session, loading } = useAuth();
  const isGuestMode = localStorage.getItem('guest_mode') === 'true';

  // Auth still restoring — never show login flash.
  if (loading) {
    console.log('[AUTH_ROUTE_REDIRECT] ProtectedRoute waiting on auth init');
    return <StartupSplash label="Loading session..." />;
  }

  // Allow guest mode access to /home only
  if (!user && !session && !isGuestMode) {
    console.log('[AUTH_ROUTE_REDIRECT] ProtectedRoute → /auth (no session)');
    return <Navigate to="/auth" replace />;
  }

  return (
    <>
      <div className={showNav ? "pb-16" : ""}>
        {children}
      </div>
      {showNav && <BottomNav />}
    </>
  );
}

/** Wrapper for /auth — keeps splash visible during session restore so the
 *  Login screen never flashes when a valid session is being re-hydrated. */
function PublicAuthRoute({ children }: { children: React.ReactNode }) {
  const { user, session, loading } = useAuth();
  const isGuestMode = typeof window !== 'undefined' && localStorage.getItem('guest_mode') === 'true';
  if (loading) {
    console.log('[AUTH_ROUTE_REDIRECT] /auth waiting on auth init');
    return <StartupSplash label="Restoring session..." />;
  }
  if (user || session || isGuestMode) {
    console.log('[AUTH_ROUTE_REDIRECT] /auth → /home (already authenticated)');
    return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
}

/** Root "/" — decide based on auth state, never redirect to /auth blindly. */
function RootRedirect() {
  const { user, session, loading } = useAuth();
  const isGuestMode = typeof window !== 'undefined' && localStorage.getItem('guest_mode') === 'true';
  if (loading) {
    console.log('[AUTH_ROUTE_REDIRECT] / waiting on auth init');
    return <StartupSplash label="Starting..." />;
  }
  if (user || session || isGuestMode) {
    return <Navigate to="/home" replace />;
  }
  return <Navigate to="/auth" replace />;
}


// Component to handle native navigation events (must be inside BrowserRouter)
function NativeNavigationHandler() {
  const navigate = useNavigate();
  
  useEffect(() => {
    const handleNativeNavigation = (event: CustomEvent) => {
      console.log("📱 Native navigation event received:", event.detail);
      
      const { navigateTo, screen, bookingId } = event.detail || {};
      const target = navigateTo || screen;
      
      if (target === "home") {
        console.log("🏠 Navigating to home screen", bookingId ? `with booking ${bookingId}` : "");
        navigate("/home");
      } else if (target === "bookings" || target === "booking_requests") {
        console.log("📋 Navigating to bookings screen", bookingId ? `with booking ${bookingId}` : "");
        navigate("/bookings");
      }
    };
    
    window.addEventListener("nativeNavigation", handleNativeNavigation as EventListener);
    window.addEventListener("native:navigate", handleNativeNavigation as EventListener);
    
    return () => {
      window.removeEventListener("nativeNavigation", handleNativeNavigation as EventListener);
      window.removeEventListener("native:navigate", handleNativeNavigation as EventListener);
    };
  }, [navigate]);
  
  return null;
}

function AppInner() {
  const { session } = useAuth();
  const { setSuppressed: setAssistantSuppressed } = useVoiceAssistant();
  useAppState(); // Refresh JWT when app comes to foreground
  useFCMTokenSync(session?.user?.id); // Sync any natively-persisted FCM token to backend
  useAutoPushRepair(session?.user?.id); // Auto-heal push token on login, open, and resume
  const { needsUpdate, softUpdate, config: updateConfig, dismissSoftUpdate } = useForceUpdateCheck();
  const { worker, loading: workerLoading } = useWorkerProfile(session?.user?.id);
  // Global always-on worker heartbeat (works regardless of online toggle).
  useWorkerHeartbeat(worker?.id ?? session?.user?.id);
  // Pass 3: verify recovery actually succeeded after boot/app-update.
  usePostBootVerification(session?.user?.id, worker?.id);
  // Pass 3: watch for permission regressions (notification/overlay/battery) and auto-repair.
  usePermissionRegressionWatch(session?.user?.id, worker?.id, !!worker?.is_available);
  const [otaResult, setOtaResult] = useState<UpdateCheckResult | null>(null);
  const [showPermissionOnboarding, setShowPermissionOnboarding] = useState(false);
  const [showBatteryWarning, setShowBatteryWarning] = useState(false);
  const [permissionCheckLoading, setPermissionCheckLoading] = useState(false);
  const [cancellationAlert, setCancellationAlert] = useState<{ bookingId?: string } | null>(null);
  const [otpReminderAlert, setOtpReminderAlert] = useState<{ bookingId: string; count: number } | null>(null);
  const cancellationAudioRef = useRef<HTMLAudioElement | null>(null);
  const cancellationTimeoutRef = useRef<number | null>(null);
  const notificationWarningShownRef = useRef(false);
  const androidPermissionFlowRef = useRef({
    running: false,
    runtimeRequested: false,
    completed: false,
  });



  const checkAndroidSettingsPermissions = useCallback(async ({ allowHide }: { allowHide: boolean }) => {
    const userId = session?.user?.id;
    if (!userId || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
      setShowPermissionOnboarding(false);
      setPermissionCheckLoading(false);
      return;
    }

    setPermissionCheckLoading(true);
    try {
      const [overlay, battery] = await Promise.all([checkOverlayState(), checkBatteryState()]);
      const overlayMissing = overlay.status !== "granted" && overlay.status !== "not_required";
      const batteryMissing = battery.status !== "granted" && battery.status !== "not_required";
      setShowBatteryWarning(batteryMissing);

      console.log(`[Permissions] onboarding check overlay=${overlay.status} battery=${battery.status}`);

      if (overlayMissing) {
        setShowPermissionOnboarding(true);
      } else if (allowHide) {
        setShowPermissionOnboarding(false);
      }
    } catch (error) {
      console.error("[Permissions] onboarding permission check failed", error);
    } finally {
      setPermissionCheckLoading(false);
    }
  }, [session?.user?.id]);

  // OTA: confirm boot success + check for updates on startup
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // First confirm this boot succeeded (clears pending marker)
      markOtaBootSuccess().then(() => {
        // Then check for new updates
        initOtaCheck().then(result => {
          if (result?.isMandatory) {
            setOtaResult(result);
          }
        });
      });
    }
  }, []);

  // Android app-launch permissions. Only runtime prompts open automatically.
  // Settings-based permissions (overlay/battery) are handled by PermissionOnboarding
  // so workers explicitly tap Enable and understand what Android Settings screen opened.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
      return;
    }

    let cancelled = false;

    const runStartupPermissionFlow = async () => {
      const userId = session?.user?.id;
      if (!userId) return;
      const flow = androidPermissionFlowRef.current;
      if (cancelled || flow.running || flow.completed) return;

      flow.running = true;
      try {
        console.log("[Permissions] Android app-launch flow started");
        if (!flow.runtimeRequested) {
          console.log("[Permissions] notification permission requested");
          const notificationEnabled = await requestNotificationPermission();
          if (!notificationEnabled && !notificationWarningShownRef.current) {
            notificationWarningShownRef.current = true;
            const state = await checkNotificationPermission();
            if (state.status === "denied" || state.status === "missing") {
              window.setTimeout(() => {
                alert("Booking alerts are disabled. Please enable notifications to receive jobs.");
              }, 500);
            }
          }
          console.log("[Permissions] activity permission requested/skipped");
          await requestActivity();
          flow.runtimeRequested = true;
        }

        const overlay = await checkOverlayState();
        console.log(`[Permissions] opening overlay settings deferred to onboarding: ${overlay.status}`);

        const battery = await checkBatteryState();
        console.log(`[Permissions] opening battery optimization settings deferred to onboarding: ${battery.status}`);

        if (!cancelled && (
          (overlay.status !== "granted" && overlay.status !== "not_required") ||
          (battery.status !== "granted" && battery.status !== "not_required")
        )) {
          await checkAndroidSettingsPermissions({ allowHide: false });
        }

        flow.completed = true;
        console.log("[Permissions] Android app-launch flow completed");
      } finally {
        flow.running = false;
      }
    };

    runStartupPermissionFlow()
      .then(() => undefined)
      .catch((error) => {
        if (!cancelled) console.error("[Permissions] Android app-launch permission flow failed", error);
      });

    const appStateSub = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive || cancelled) return;
      window.setTimeout(() => {
        runStartupPermissionFlow().catch((error) => {
          if (!cancelled) console.error("[Permissions] Android resumed permission flow failed", error);
        });
      }, 700);
    });

    return () => {
      cancelled = true;
      appStateSub.then((sub) => sub.remove());
    };
  }, [checkAndroidSettingsPermissions, session?.user?.id]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
      setShowPermissionOnboarding(false);
      setPermissionCheckLoading(false);
      return;
    }

    checkAndroidSettingsPermissions({ allowHide: false });

    const appStateSub = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      window.setTimeout(() => {
        checkAndroidSettingsPermissions({ allowHide: true });
      }, 700);
    });

    return () => {
      appStateSub.then((sub) => sub.remove());
    };
  }, [checkAndroidSettingsPermissions, session?.user?.id]);

  // ── Passive movement tracking DISABLED ──
  // Step/movement tracking now runs ONLY after a booking is accepted.
  // The active-job effect below owns the lifecycle globally so it survives
  // navigation between Home / Profile / Bookings / Availability.
  useEffect(() => {
    void stopPassiveMovementMonitoring();
  }, [worker?.id]);

  // ── Booking-driven movement tracking (global, survives navigation) ──
  // Single source of truth for start/stop. Runs whenever the worker has an
  // active booking in [accepted, on_the_way, started]. Stops as soon as the
  // booking transitions to a terminal state (completed/cancelled/none).
  const { activeJob: trackedJob } = useActiveJob(session?.user?.id);
  useEffect(() => {
    if (!worker?.id) return;
    const status = trackedJob?.status;
    const shouldTrack = !!trackedJob?.id && ["assigned", "accepted", "on_the_way", "started"].includes(status ?? "");
    if (!shouldTrack) {
      console.log(`[Movement] stopped because booking ended (status=${status ?? "none"})`);
      void stopMovementMonitoring();
      return;
    }
    console.log("[Movement] booking accepted");
    startMovementMonitoring(trackedJob!.id, worker.id).catch((error) => {
      console.error("[Movement] active-job start failed", error);
    });
  }, [worker?.id, trackedJob?.id, trackedJob?.status]);

  // ── Phase 3: Voice assistant global hooks ──
  const isOnline = !!worker?.is_available;
  const hasActiveJob = !!trackedJob?.id && ["assigned","accepted","on_the_way","started"].includes(trackedJob?.status ?? "");
  useVoiceBookingAnnouncements({ hasActiveJob, suppressed: false });
  useMorningBriefing(session?.user?.id, hasActiveJob);
  useEveningSummary({ isOnline, suppressed: hasActiveJob });
  useIdleTips({ isOnline, hasActiveJob, suppressed: false });




  // Initialize native push notifications when we have a session.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    if (!Capacitor.isNativePlatform()) return;
    console.log("🔔 Initializing native push for user:", userId);
    initNativePush(userId);
  }, [session?.user?.id]);

  // Movement tracking is owned exclusively by the global active-job effect above.
  // No additional listeners — they previously caused redundant start/stop races
  // that tore down the native step-event listener mid-session.

  // Handle deep links for booking acceptance
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    
    const sub = CapApp.addListener('appUrlOpen', async (data) => {
      try {
        // Block deep-link actions if worker is blocked
        if (worker?.is_blocked) {
          console.log('🚫 Deep link blocked: worker is blocked');
          return;
        }
        const url = new URL(data.url);
          if (url.protocol === 'didinow:' && url.hostname === 'accept') {
            const bookingId = url.searchParams.get('bookingId') || '';
            if (bookingId) {
              console.log('🔗 Deep link accept for bookingId:', bookingId);
              const result = await tryAccept(bookingId);
              if (!result.success) {
                console.warn('Booking accept failed:', result.error);
              } else {
                window.dispatchEvent(new CustomEvent('bookingAccepted', { detail: { bookingId } }));
              }
            }
          }
      } catch (e) {
        console.error('appUrlOpen parse error', e);
      }
    });
    return () => { sub.then(s => s.remove()); };
  }, [worker?.is_blocked]);

  const closeCancellationPopup = useCallback(() => {
    if (cancellationTimeoutRef.current) {
      window.clearTimeout(cancellationTimeoutRef.current);
      cancellationTimeoutRef.current = null;
    }
    stopCancellationVoice();
    setCancellationAlert(null);
  }, []);

  const forceStopCancellationAlert = useCallback(() => {
    if (cancellationTimeoutRef.current) {
      window.clearTimeout(cancellationTimeoutRef.current);
      cancellationTimeoutRef.current = null;
    }
    if (cancellationAudioRef.current) {
      cancellationAudioRef.current.pause();
      cancellationAudioRef.current.currentTime = 0;
      cancellationAudioRef.current = null;
    }
    stopCancellationVoice();
    setCancellationAlert(null);
  }, []);

  const showCancellationAlert = useCallback((bookingId?: string) => {
    setCancellationAlert((prev) => {
      // Dedupe: same booking already showing → ignore.
      if (prev && prev.bookingId === bookingId) return prev;
      return { bookingId };
    });
    if (cancellationTimeoutRef.current) window.clearTimeout(cancellationTimeoutRef.current);
    startCancellationVoice();
    // Safety: auto-close popup after 45s even if worker doesn't tap OK.
    cancellationTimeoutRef.current = window.setTimeout(closeCancellationPopup, 45000);
  }, [closeCancellationPopup]);

  useEffect(() => {
    const onBookingCancelled = (event: Event) => {
      const bookingId = (event as CustomEvent)?.detail?.bookingId;
      showCancellationAlert(bookingId);
    };
    const onBookingAccepted = () => {
      // A new booking was accepted — silence cancellation voice + close popup.
      forceStopCancellationAlert();
    };
    window.addEventListener("bookingCancelledAlert", onBookingCancelled);
    window.addEventListener("bookingAccepted", onBookingAccepted);
    return () => {
      window.removeEventListener("bookingCancelledAlert", onBookingCancelled);
      window.removeEventListener("bookingAccepted", onBookingAccepted);
      forceStopCancellationAlert();
    };
  }, [showCancellationAlert, forceStopCancellationAlert]);

  // OTP completion reminder escalation (60 min after accept, every 10 min).
  const { pendingBookings: otpPendingBookings } = useOtpReminderEscalation(session?.user?.id);
  useEffect(() => {
    const onOtpReminder = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const bookingId = detail.bookingId as string | undefined;
      const count = (detail.count as number | undefined) ?? 1;
      if (!bookingId) return;
      setOtpReminderAlert({ bookingId, count });
      startOtpReminderVoice();
    };
    window.addEventListener("otpReminderAlert", onOtpReminder);
    return () => {
      window.removeEventListener("otpReminderAlert", onOtpReminder);
      stopOtpReminderVoice();
    };
  }, []);

  const closeOtpReminder = useCallback(
    (acknowledgedVia: "ok" | "enter_otp" | "auto_open") => {
      const current = otpReminderAlert;
      stopOtpReminderVoice();
      setOtpReminderAlert(null);
      if (current?.bookingId) {
        void logOtpReminderEvent(current.bookingId, "otp_reminder_acknowledged", {
          via: acknowledgedVia,
          count: current.count,
        });
      }
      // Reminder #1 (count=1): OK just closes.
      // Reminder #2 (count=2): OK also navigates to the OTP screen.
      // Reminder #3+ (count>=3): auto-opens after the voice finishes.
      const shouldNavigate =
        acknowledgedVia !== "ok" || (current?.count ?? 0) >= 2;
      if (shouldNavigate && current?.bookingId) {
        window.location.assign(`/complete-booking/${current.bookingId}?focusOtp=1`);
      }
    },
    [otpReminderAlert]
  );

  // Reminder #3+: auto-open the OTP screen once the voice finishes (~13s).
  useEffect(() => {
    if (!otpReminderAlert || otpReminderAlert.count < 3) return;
    const t = window.setTimeout(() => {
      closeOtpReminder("auto_open");
    }, 13000);
    return () => window.clearTimeout(t);
  }, [otpReminderAlert, closeOtpReminder]);

  // Listen for push notification messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "BOOKING_ALERT" && event.data?.bookingId) {
        console.log("Received BOOKING_ALERT message:", event.data.bookingId);
        // The booking alert modal will be triggered by the existing useBookingAlerts hook
        // which listens to the bookings table and shows the modal automatically
      } else if (event.data?.type === "BOOKING_CANCELLED") {
        showCancellationAlert(event.data?.bookingId || event.data?.booking_id);
      } else if (event.data?.type === "BOOKING_REASSIGNED") {
        import("@/lib/bookingReassign").then(({ handleBookingReassigned }) =>
          handleBookingReassigned(event.data?.bookingId || event.data?.booking_id, "postMessage")
        );
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [showCancellationAlert]);

  // If Play Store update is required, show force update screen (HARD BLOCK)
  if (needsUpdate) {
    return (
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ForceUpdateScreen config={updateConfig} />
      </TooltipProvider>
    );
  }

  // If worker is blocked, show blocked screen (after loading completes)
  if (!workerLoading && session?.user?.id && worker?.is_blocked === true) {
    return (
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <WorkerBlocked reason={worker?.blocked_reason} />
      </TooltipProvider>
    );
  }

  if (session?.user?.id && permissionCheckLoading && !showPermissionOnboarding) {
    return (
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground">Checking permissions...</p>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  if (session?.user?.id && showPermissionOnboarding) {
    return (
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <PermissionOnboarding onComplete={() => checkAndroidSettingsPermissions({ allowHide: true })} />
      </TooltipProvider>
    );
  }

  // If mandatory OTA update is required, show OTA modal over the app
  const showOtaMandatory = otaResult?.isMandatory && otaResult?.bundleInfo;

  // Suppress the Voice Assistant FAB whenever a fullscreen modal is on screen
  // so it never covers OTA/permission/battery/cancellation/OTP overlays.
  useEffect(() => {
    const suppress = Boolean(
      showOtaMandatory ||
      showBatteryWarning ||
      cancellationAlert ||
      otpReminderAlert,
    );
    setAssistantSuppressed(suppress);
  }, [showOtaMandatory, showBatteryWarning, cancellationAlert, otpReminderAlert, setAssistantSuppressed]);


  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {showOtaMandatory && <OtaMandatoryModal bundleInfo={otaResult.bundleInfo!} />}
      <SoftUpdatePrompt open={softUpdate && !showOtaMandatory} config={updateConfig} onRemindLater={dismissSoftUpdate} />
      {showBatteryWarning && session?.user?.id && (
        <div className="fixed inset-0 z-[90]">
          <BatteryOnboarding
            onFixNow={() => {
              requestBatteryExemption();
              setShowBatteryWarning(false);
            }}
            onSkip={() => setShowBatteryWarning(false)}
          />
        </div>
      )}
      {cancellationAlert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-5 animate-fade-in">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-center shadow-2xl">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-foreground">Booking Cancelled</h2>
            <p className="mt-3 text-lg font-semibold text-foreground">Do not go to the flat</p>
            <p className="mt-2 text-sm text-muted-foreground">Your booking was cancelled.</p>
            <button
              className="mt-8 w-full rounded-xl bg-primary py-4 text-lg font-bold text-primary-foreground active:scale-[0.98] transition-transform"
              onClick={closeCancellationPopup}
            >
              OK
            </button>
          </div>
        </div>
      )}
      {otpReminderAlert && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/95 p-5 animate-fade-in">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-7 text-center shadow-2xl">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-foreground">⚠ OTP Pending</h2>
            <p className="mt-3 text-base text-foreground">
              This booking was accepted more than 60 minutes ago and the customer OTP has not been entered.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Please collect the OTP from the customer and complete the booking.
            </p>
            <button
              className="mt-7 w-full rounded-xl bg-primary py-4 text-lg font-bold text-primary-foreground active:scale-[0.98] transition-transform"
              onClick={() => closeOtpReminder("enter_otp")}
            >
              Enter OTP Now
            </button>
            <button
              className="mt-3 w-full rounded-xl border border-border bg-card py-3 text-base font-semibold text-foreground active:scale-[0.98] transition-transform"
              onClick={() => closeOtpReminder("ok")}
            >
              OK
            </button>
          </div>
        </div>
      )}
      <BrowserRouter>
        <NativeNavigationHandler />
        <OtpPendingBanner bookings={otpPendingBookings} />
        <VoiceAssistantFAB />
        <VoiceAssistantSheet />
        <FirstTimeTourMount />

        <Routes>
          <Route path="/auth" element={<PublicAuthRoute><Auth /></PublicAuthRoute>} />
          <Route path="/otp-verify" element={<OtpVerify />} />
          <Route path="/home" element={<ProtectedRoute showNav={true}><Home /></ProtectedRoute>} />
          <Route path="/bookings" element={<ProtectedRoute showNav={true}><Bookings /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute showNav={true}><Profile /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/troubleshoot" element={<ProtectedRoute><Troubleshoot /></ProtectedRoute>} />
          <Route path="/availability" element={<ProtectedRoute><Availability /></ProtectedRoute>} />
          <Route path="/verify-push" element={<ProtectedRoute><VerifyPush /></ProtectedRoute>} />
          <Route path="/dev-cache-reset" element={<ProtectedRoute><DevCacheReset /></ProtectedRoute>} />
          <Route path="/earnings" element={<ProtectedRoute><Earnings /></ProtectedRoute>} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/contact-support" element={<ProtectedRoute><ContactSupport /></ProtectedRoute>} />
          <Route path="/customer-reviews" element={<ProtectedRoute><CustomerReviews /></ProtectedRoute>} />
          <Route path="/admin-upload-qr" element={<AdminUploadQr />} />
          <Route path="/admin-token-health" element={<AdminTokenHealth />} />
          <Route path="/admin-priority-shadow" element={<AdminPriorityShadow />} />
          <Route path="/admin-dispatch-telemetry" element={<AdminDispatchTelemetry />} />
          <Route path="/auth-debug" element={<ProtectedRoute><AuthDebug /></ProtectedRoute>} />
          <Route path="/support-diagnostics" element={<ProtectedRoute><AuthDebug /></ProtectedRoute>} />
          <Route path="/device-readiness" element={<ProtectedRoute><DeviceReadiness /></ProtectedRoute>} />
          <Route path="/booking-diagnostics" element={<ProtectedRoute><BookingDiagnostics /></ProtectedRoute>} />
          <Route path="/diagnostics" element={<ProtectedRoute><BookingDiagnostics /></ProtectedRoute>} />
          <Route path="/complete-booking/:bookingId" element={<ProtectedRoute><CompleteBooking /></ProtectedRoute>} />
          <Route path="/account-details" element={<ProtectedRoute><AccountDetails /></ProtectedRoute>} />
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  );
}

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <VoiceAssistantProvider>
          <AppInner />
        </VoiceAssistantProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
