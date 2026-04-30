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
import AuthDebug from "./pages/AuthDebug";
import Earnings from "./pages/Earnings";
import WorkerBlocked from "./pages/WorkerBlocked";
import DeviceReadiness from "./pages/DeviceReadiness";
import CompleteBooking from "./pages/CompleteBooking";
import AccountDetails from "./pages/AccountDetails";
import BottomNav from "./components/BottomNav";
import PermissionOnboarding from "./components/PermissionOnboarding";
import { startMovementMonitoring } from "@/lib/stepMonitoring";

const queryClient = new QueryClient();

function ProtectedRoute({ children, showNav = false }: { children: React.ReactNode; showNav?: boolean }) {
  const { user, session, loading } = useAuth();
  const isGuestMode = localStorage.getItem('guest_mode') === 'true';

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading session...</p>
        </div>
      </div>
    );
  }

  // Allow guest mode access to /home only
  if (!user && !session && !isGuestMode) {
    console.log('🚫 ProtectedRoute: No user/session, redirecting to /auth');
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


  // Initialize native push notifications when we have a session.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    if (!Capacitor.isNativePlatform()) return;
    console.log("🔔 Initializing native push for user:", userId);
    initNativePush(userId);
  }, [session?.user?.id]);

  useEffect(() => {
    if (!worker?.id) return;

    const startAcceptedBookingMovementCheck = (bookingId?: string) => {
      if (!bookingId) return;
      console.log(`[Movement] Native accept detected — starting movement monitoring for booking=${bookingId}`);
      startMovementMonitoring(bookingId, worker.id).catch((error) => {
        console.error("[Movement] Native accept movement monitoring failed", error);
      });
    };

    const onBookingAccepted = (event: Event) => {
      const bookingId = (event as CustomEvent)?.detail?.bookingId;
      startAcceptedBookingMovementCheck(bookingId);
    };

    const onNativeNavigate = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const target = detail.navigateTo || detail.screen;
      if (target === "home") startAcceptedBookingMovementCheck(detail.bookingId);
    };

    window.addEventListener("bookingAccepted", onBookingAccepted);
    window.addEventListener("native:navigate", onNativeNavigate);
    window.addEventListener("nativeNavigation", onNativeNavigate);

    return () => {
      window.removeEventListener("bookingAccepted", onBookingAccepted);
      window.removeEventListener("native:navigate", onNativeNavigate);
      window.removeEventListener("nativeNavigation", onNativeNavigate);
    };
  }, [worker?.id]);

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

  const stopCancellationAlert = useCallback(() => {
    if (cancellationTimeoutRef.current) {
      window.clearTimeout(cancellationTimeoutRef.current);
      cancellationTimeoutRef.current = null;
    }
    if (cancellationAudioRef.current) {
      cancellationAudioRef.current.pause();
      cancellationAudioRef.current.currentTime = 0;
      cancellationAudioRef.current = null;
    }
    if ("vibrate" in navigator) navigator.vibrate(0);
    setCancellationAlert(null);
  }, []);

  const showCancellationAlert = useCallback((bookingId?: string) => {
    setCancellationAlert({ bookingId });
    if (cancellationTimeoutRef.current) window.clearTimeout(cancellationTimeoutRef.current);
    if (cancellationAudioRef.current) {
      cancellationAudioRef.current.pause();
      cancellationAudioRef.current.currentTime = 0;
    }
    const audio = new Audio("/sounds/booking_cancellation_voice.mp3");
    audio.loop = true;
    cancellationAudioRef.current = audio;
    audio.play().catch((error) => console.warn("Cancellation voice autoplay blocked", error));
    if ("vibrate" in navigator) navigator.vibrate([700, 200, 700, 200, 1000]);
    cancellationTimeoutRef.current = window.setTimeout(stopCancellationAlert, 45000);
  }, [stopCancellationAlert]);

  useEffect(() => {
    const onBookingCancelled = (event: Event) => {
      const bookingId = (event as CustomEvent)?.detail?.bookingId;
      showCancellationAlert(bookingId);
    };
    window.addEventListener("bookingCancelledAlert", onBookingCancelled);
    return () => {
      window.removeEventListener("bookingCancelledAlert", onBookingCancelled);
      stopCancellationAlert();
    };
  }, [showCancellationAlert, stopCancellationAlert]);

  // Listen for push notification messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "BOOKING_ALERT" && event.data?.bookingId) {
        console.log("Received BOOKING_ALERT message:", event.data.bookingId);
        // The booking alert modal will be triggered by the existing useBookingAlerts hook
        // which listens to the bookings table and shows the modal automatically
      } else if (event.data?.type === "BOOKING_CANCELLED") {
        showCancellationAlert(event.data?.bookingId || event.data?.booking_id);
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
        <div className="fixed left-3 right-3 top-3 z-50 rounded-md border border-destructive/30 bg-background p-3 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Battery optimization may block booking alerts.</p>
              <p className="mt-1 text-xs text-muted-foreground">Disable battery optimization for Didi Now Partner to receive jobs reliably.</p>
            </div>
            <Button size="sm" className="h-8 shrink-0" onClick={() => requestBatteryExemption()}>
              Open settings
            </Button>
          </div>
        </div>
      )}
      {cancellationAlert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-5">
          <div className="w-full max-w-sm rounded-lg border-2 border-destructive bg-card p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
              <span className="text-3xl font-bold">!</span>
            </div>
            <h2 className="text-2xl font-bold text-destructive">Booking Cancelled</h2>
            <p className="mt-3 text-lg font-semibold text-foreground">Do not go to the flat</p>
            <p className="mt-2 text-sm text-muted-foreground">Your booking was cancelled.</p>
            <Button className="mt-6 w-full" variant="destructive" size="lg" onClick={stopCancellationAlert}>
              OK
            </Button>
          </div>
        </div>
      )}
      <BrowserRouter>
        <NativeNavigationHandler />
        <Routes>
          <Route path="/auth" element={<Auth />} />
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
          <Route path="/auth-debug" element={<ProtectedRoute><AuthDebug /></ProtectedRoute>} />
          <Route path="/support-diagnostics" element={<ProtectedRoute><AuthDebug /></ProtectedRoute>} />
          <Route path="/device-readiness" element={<ProtectedRoute><DeviceReadiness /></ProtectedRoute>} />
          <Route path="/complete-booking/:bookingId" element={<ProtectedRoute><CompleteBooking /></ProtectedRoute>} />
          <Route path="/account-details" element={<ProtectedRoute><AccountDetails /></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/auth" replace />} />
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
