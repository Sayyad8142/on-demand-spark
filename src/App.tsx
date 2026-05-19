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
import { useFCMTokenSync } from "@/hooks/useFCMTokenSync";
import { useAppState } from "@/hooks/useAppState";
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
import AuthDebug from "./pages/AuthDebug";
import Earnings from "./pages/Earnings";
import WorkerBlocked from "./pages/WorkerBlocked";
import DeviceReadiness from "./pages/DeviceReadiness";
import CompleteBooking from "./pages/CompleteBooking";
import AccountDetails from "./pages/AccountDetails";
import DailyDuty from "./pages/DailyDuty";
import { shouldShowDailyDuty, scheduleMorningReminder } from "@/lib/dailyDuty";
import BottomNav from "./components/BottomNav";
import PermissionOnboarding from "./components/PermissionOnboarding";
import {
  startMovementMonitoring,
  stopMovementMonitoring,
  startPassiveMovementMonitoring,
  stopPassiveMovementMonitoring,
  isPassiveMonitoringActive,
} from "@/lib/stepMonitoring";
import { useActiveJob } from "@/hooks/useActiveJob";

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
    if (shouldShowDailyDuty()) return <Navigate to="/daily-duty" replace />;
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
  useAppState(); // Refresh JWT when app comes to foreground
  useFCMTokenSync(session?.user?.id); // Sync any natively-persisted FCM token to backend
  useAutoPushRepair(session?.user?.id); // Auto-heal push token on login, open, and resume
  const { needsUpdate, softUpdate, config: updateConfig, dismissSoftUpdate } = useForceUpdateCheck();
  const { worker, loading: workerLoading } = useWorkerProfile(session?.user?.id);
  const [otaResult, setOtaResult] = useState<UpdateCheckResult | null>(null);
  const [showPermissionOnboarding, setShowPermissionOnboarding] = useState(false);
  const [showBatteryWarning, setShowBatteryWarning] = useState(false);
  const [permissionCheckLoading, setPermissionCheckLoading] = useState(false);
  const [cancellationAlert, setCancellationAlert] = useState<{ bookingId?: string } | null>(null);
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

  // Closes the popup only. Voice now auto-stops after 3 repeats and is NOT
  // tied to this button (per spec). Use forceStopCancellationAlert to also
  // silence audio (e.g. on a new booking acceptance).
  const closeCancellationPopup = useCallback(() => {
    if (cancellationTimeoutRef.current) {
      window.clearTimeout(cancellationTimeoutRef.current);
      cancellationTimeoutRef.current = null;
    }
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

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {showOtaMandatory && <OtaMandatoryModal bundleInfo={otaResult.bundleInfo!} />}
      <SoftUpdatePrompt open={softUpdate && !showOtaMandatory} config={updateConfig} onRemindLater={dismissSoftUpdate} />
      {showBatteryWarning && session?.user?.id && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-background/70 backdrop-blur-sm p-5"
          onClick={() => setShowBatteryWarning(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border-2 border-primary bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <span className="text-2xl">🔋</span>
            </div>
            <h2 className="text-center text-lg font-bold text-foreground">
              Battery optimization may block booking alerts
            </h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Disable battery optimization for Didi Now Partner to receive jobs reliably.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Button
                size="lg"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  requestBatteryExemption();
                  setShowBatteryWarning(false);
                }}
              >
                Open settings
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => setShowBatteryWarning(false)}
              >
                Not now
              </Button>
            </div>
          </div>
        </div>
      )}
      {cancellationAlert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-5 animate-fade-in">
          <div
            className="w-full max-w-sm rounded-lg border-2 border-destructive bg-card p-6 text-center shadow-2xl"
            style={{ animation: "cancel-shake 0.5s ease-in-out 0s 2, scale-in 0.2s ease-out" }}
          >
            <div
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
              style={{ animation: "cancel-pulse 1.1s ease-in-out infinite" }}
            >
              <span className="text-3xl font-bold">!</span>
            </div>
            <h2 className="text-2xl font-bold text-destructive">Booking Cancelled</h2>
            <p className="mt-3 text-lg font-semibold text-foreground">Do not go to the flat</p>
            <p className="mt-2 text-sm text-muted-foreground">Your booking was cancelled.</p>
            <Button className="mt-6 w-full" variant="destructive" size="lg" onClick={closeCancellationPopup}>
              OK
            </Button>
          </div>
        </div>
      )}
      <BrowserRouter>
        <NativeNavigationHandler />
        <Routes>
          <Route path="/auth" element={<PublicAuthRoute><Auth /></PublicAuthRoute>} />
          <Route path="/otp-verify" element={<OtpVerify />} />
          <Route path="/daily-duty" element={<ProtectedRoute><DailyDuty /></ProtectedRoute>} />
          <Route path="/home" element={<ProtectedRoute showNav={true}><HomeWithDutyGate /></ProtectedRoute>} />
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
          <Route path="/auth-debug" element={<ProtectedRoute><AuthDebug /></ProtectedRoute>} />
          <Route path="/support-diagnostics" element={<ProtectedRoute><AuthDebug /></ProtectedRoute>} />
          <Route path="/device-readiness" element={<ProtectedRoute><DeviceReadiness /></ProtectedRoute>} />
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
        <AppInner />
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
