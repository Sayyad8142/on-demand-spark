import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
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
// requestLocationPermissions intentionally not imported — see startup effect note below.
import { initOtaCheck, markOtaBootSuccess, type UpdateCheckResult } from "@/lib/liveUpdate";
import { OtaMandatoryModal } from "@/components/OtaMandatoryModal";
import PermissionOnboarding from "@/components/PermissionOnboarding";
import { checkAllPermissions, hasOutstandingPermissions } from "@/lib/permissions";
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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  // Decide whether to show the unified Permission Onboarding screen.
  // Runs once on app start: skip on web, skip if user already dismissed it
  // and nothing is missing, otherwise show it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!Capacitor.isNativePlatform()) {
        setOnboardingChecked(true);
        return;
      }
      const dismissed = localStorage.getItem("perm_onboarding_dismissed_v1") === "true";
      const states = await checkAllPermissions();
      const outstanding = hasOutstandingPermissions(states);
      if (cancelled) return;
      // Show if: never dismissed OR something is still missing
      setShowOnboarding(!dismissed || outstanding);
      setOnboardingChecked(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleOnboardingComplete = () => {
    localStorage.setItem("perm_onboarding_dismissed_v1", "true");
    setShowOnboarding(false);
  };

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

  // NOTE: Location permission request intentionally disabled at startup.
  // For this phase, only the unified PermissionOnboarding flow is allowed
  // to ask for permissions (notifications, overlay, battery, activity).
  // Re-enable here later if/when location is added to the onboarding screen.


  // Initialize native push notifications when we have a session.
  // Permission prompt is owned by PermissionOnboarding — here we only
  // register the device token if permission was already granted.
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

  // Show unified Permission Onboarding before the rest of the app — only on
  // native, only on first run (or while permissions remain missing).
  if (onboardingChecked && showOnboarding && Capacitor.isNativePlatform()) {
    return (
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <PermissionOnboarding onComplete={handleOnboardingComplete} />
      </TooltipProvider>
    );
  }

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
