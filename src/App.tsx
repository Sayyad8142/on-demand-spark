import { useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
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
  checkAllPermissions,
  requestActivity,
  requestBatteryExemption,
  requestOverlay,
  type PermissionId,
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
import IncompleteBankSetup from "./components/IncompleteBankSetup";
import { getBankSetupStatus } from "./lib/bankSetup";

const queryClient = new QueryClient();

function ProtectedRoute({ children, showNav = false }: { children: React.ReactNode; showNav?: boolean }) {
  const { user, session, loading } = useAuth();
  const isGuestMode = localStorage.getItem('guest_mode') === 'true';
  const location = useLocation();
  const { worker, loading: workerLoading } = useWorkerProfile(session?.user?.id);

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

  // Bank-setup guard: block app usage when bank details are missing.
  // Skip in guest mode and on the page that lets them fix it.
  const ALLOWED_WHEN_INCOMPLETE = ["/account-details"];
  const isAllowedRoute = ALLOWED_WHEN_INCOMPLETE.some((p) =>
    location.pathname.startsWith(p)
  );
  const bankSetup = getBankSetupStatus(worker);
  const shouldBlock =
    !isGuestMode &&
    !!session?.user?.id &&
    !workerLoading &&
    !!worker &&
    !bankSetup.isComplete &&
    !isAllowedRoute;

  if (shouldBlock) {
    return <IncompleteBankSetup />;
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
      
      const { navigateTo, bookingId } = event.detail || {};
      
      if (navigateTo === "home") {
        console.log("🏠 Navigating to home screen", bookingId ? `with booking ${bookingId}` : "");
        navigate("/home");
      }
    };
    
    window.addEventListener("nativeNavigation", handleNativeNavigation as EventListener);
    
    return () => {
      window.removeEventListener("nativeNavigation", handleNativeNavigation as EventListener);
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
  const startupPermissionRequestInFlight = useRef(false);
  const overlayReturnCheckPending = useRef(false);

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

  // Restore normal first-launch Android permission flow without showing the
  // removed onboarding screen. Notifications are still handled by initNativePush;
  // overlay, battery optimization, and activity recognition are requested
  // automatically once per signed-in user/install, one step per active session.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;

    const storageKey = `android_startup_permission_attempts_v1:${userId}`;
    const orderedPermissions: PermissionId[] = ["overlay", "battery", "activity"];

    const readAttempted = () => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return new Set<PermissionId>();
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return new Set<PermissionId>();
        return new Set(parsed.filter((value): value is PermissionId => orderedPermissions.includes(value)));
      } catch {
        return new Set<PermissionId>();
      }
    };

    const writeAttempted = (attempted: Set<PermissionId>) => {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(attempted)));
    };

    const requestPermissionById = async (permissionId: PermissionId) => {
      switch (permissionId) {
        case "overlay":
          overlayReturnCheckPending.current = true;
          console.log("[Permissions] 📣 Startup attempting ACTION_MANAGE_OVERLAY_PERMISSION intent");
          toast("Opening Display over other apps", {
            description: "Attempting ACTION_MANAGE_OVERLAY_PERMISSION for Didi Now Partner.",
          });
          await requestOverlay();
          break;
        case "battery":
          await requestBatteryExemption();
          break;
        case "activity":
          await requestActivity();
          break;
        default:
          break;
      }
    };

    const runStartupPermissionFlow = async () => {
      if (startupPermissionRequestInFlight.current) return;
      startupPermissionRequestInFlight.current = true;

      try {
        const states = await checkAllPermissions();
        const attempted = readAttempted();
        const nextPermission = orderedPermissions.find((permissionId) => {
          const state = states.find((entry) => entry.id === permissionId);
          return !!state && state.canRequest && state.status !== "granted" && state.status !== "not_required" && !attempted.has(permissionId);
        });

        if (!nextPermission) return;

        attempted.add(nextPermission);
        writeAttempted(attempted);
        console.log(`[Permissions] 🚀 Startup auto-request for ${nextPermission}`);
        await requestPermissionById(nextPermission);
      } catch (error) {
        console.error("[Permissions] Startup auto-request flow failed", error);
      } finally {
        startupPermissionRequestInFlight.current = false;
      }
    };

    const reportOverlayStateAfterReturn = async () => {
      if (!overlayReturnCheckPending.current) return;
      overlayReturnCheckPending.current = false;

      try {
        const states = await checkAllPermissions();
        const overlayState = states.find((entry) => entry.id === "overlay");
        const canDrawOverlays = overlayState?.status === "granted";
        console.log(`[Permissions] 🔁 Returned from ACTION_MANAGE_OVERLAY_PERMISSION; Settings.canDrawOverlays()=${canDrawOverlays}`);

        if (canDrawOverlays) {
          toast.success("Display over other apps enabled", {
            description: "Settings.canDrawOverlays() returned true after returning to the app.",
          });
        } else {
          toast("Display over other apps still disabled", {
            description: "Settings.canDrawOverlays() returned false after returning to the app.",
          });
        }
      } catch (error) {
        console.error("[Permissions] Failed to check Settings.canDrawOverlays() after return", error);
        toast.error("Could not verify overlay permission", {
          description: "Failed while checking Settings.canDrawOverlays() after returning.",
        });
      }
    };

    const timer = window.setTimeout(runStartupPermissionFlow, 900);
    const appStateSub = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        void reportOverlayStateAfterReturn();
        void runStartupPermissionFlow();
      }
    });

    return () => {
      window.clearTimeout(timer);
      appStateSub.then((listener) => listener.remove());
    };
  }, [session?.user?.id]);


  // Initialize native push notifications when we have a session.
  // This shows the normal Android notification permission prompt when needed.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    if (!Capacitor.isNativePlatform()) return;
    console.log("🔔 Initializing native push for user:", userId);
    initNativePush(userId);
  }, [session?.user?.id]);

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

  // Listen for push notification messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "BOOKING_ALERT" && event.data?.bookingId) {
        console.log("Received BOOKING_ALERT message:", event.data.bookingId);
        // The booking alert modal will be triggered by the existing useBookingAlerts hook
        // which listens to the bookings table and shows the modal automatically
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

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

  // If mandatory OTA update is required, show OTA modal over the app
  const showOtaMandatory = otaResult?.isMandatory && otaResult?.bundleInfo;

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {showOtaMandatory && <OtaMandatoryModal bundleInfo={otaResult.bundleInfo!} />}
      <SoftUpdatePrompt open={softUpdate && !showOtaMandatory} config={updateConfig} onRemindLater={dismissSoftUpdate} />
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
