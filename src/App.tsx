import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { useAuth } from "@/hooks/useAuth";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAppState } from "@/hooks/useAppState";
import { useForceUpdateCheck } from "@/hooks/useForceUpdateCheck";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { useNativeBookingActions } from "@/hooks/useNativeBookingActions";
import { initNativePush } from "@/native/push";
import { requestAndroidOverlay } from "@/lib/overlay";
import { tryAccept } from "@/lib/bookingActions";
import { requestLocationPermissions } from "@/lib/backgroundLocation";
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
import BottomNav from "./components/BottomNav";

const queryClient = new QueryClient();

function ProtectedRoute({ children, showNav = false }: { children: React.ReactNode; showNav?: boolean }) {
  const { user, loading } = useAuth();
  const isGuestMode = localStorage.getItem('guest_mode') === 'true';

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  // Allow guest mode access to /home only
  if (!user && !isGuestMode) {
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
    const handleNativeNavigation = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      console.log("📱 Native navigation event received:", detail);

      // Android dispatches: window.dispatchEvent(new CustomEvent('native:navigate', { detail: { screen, bookingId } }))
      // Keep backward compatibility with older event shape too.
      const screen = detail.screen ?? detail.navigateTo;
      const bookingId = detail.bookingId;

      if (screen === "home") {
        console.log("🏠 Navigating to home screen", bookingId ? `with booking ${bookingId}` : "");
        navigate("/home");
      }
    };

    window.addEventListener("native:navigate", handleNativeNavigation as EventListener);
    window.addEventListener("nativeNavigation", handleNativeNavigation as EventListener);

    return () => {
      window.removeEventListener("native:navigate", handleNativeNavigation as EventListener);
      window.removeEventListener("nativeNavigation", handleNativeNavigation as EventListener);
    };
  }, [navigate]);

  return null;
}

function UpdateGate({ needsUpdate }: { needsUpdate: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (needsUpdate && location.pathname !== "/force-update") {
      navigate("/force-update", { replace: true });
    }

    if (!needsUpdate && location.pathname === "/force-update") {
      navigate("/auth", { replace: true });
    }
  }, [needsUpdate, location.pathname, navigate]);

  return null;
}

function AppInner() {
  const { session } = useAuth();
  useAppState(); // Refresh JWT when app comes to foreground
  const { needsUpdate, loading: updateCheckLoading } = useForceUpdateCheck();

  // IMPORTANT: This must be mounted globally (not just on /home), otherwise
  // overlay actions are lost on cold start when the app opens on /auth.
  const { worker } = useWorkerProfile(session?.user?.id);
  const workerIdForNativeActions = worker?.id ?? session?.user?.id;
  useNativeBookingActions(workerIdForNativeActions);

  // Request location permissions on app startup for native platforms
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      console.log('📍 Requesting location permissions on app startup');
      requestLocationPermissions().then((granted) => {
        if (granted) {
          console.log('✅ Location permissions granted');
        } else {
          console.log('❌ Location permissions denied');
        }
      });
    }
  }, []);

  // Initialize native push notifications when we have a session
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    console.log("User logged in:", userId);

    if (Capacitor.isNativePlatform()) {
      console.log("🔔 Initializing native push for user:", userId);
      initNativePush(userId);

      // Request overlay permission on Android
      if (Capacitor.getPlatform() === 'android') {
        requestAndroidOverlay();
      }
    }
    // Web push registration is now done manually via /troubleshoot or /verify-push pages
  }, [session?.user?.id]);

  // Handle deep links for booking acceptance
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const sub = CapApp.addListener('appUrlOpen', async (data) => {
      try {
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
    return () => {
      sub.then((s) => s.remove());
    };
  }, []);

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

  // NOTE: We intentionally do NOT block app startup on update check.
  // Blocking here can cause native overlay events to be missed on cold start.

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <NativeNavigationHandler />
          <UpdateGate needsUpdate={needsUpdate} />

          {/* Non-blocking update check indicator */}
          {updateCheckLoading && (
            <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground shadow">
              Checking update…
            </div>
          )}

          <Routes>
            <Route path="/force-update" element={<ForceUpdateScreen />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/otp-verify" element={<OtpVerify />} />
            <Route
              path="/home"
              element={
                <ProtectedRoute showNav={true}>
                  <Home />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bookings"
              element={
                <ProtectedRoute showNav={true}>
                  <Bookings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute showNav={true}>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/troubleshoot"
              element={
                <ProtectedRoute>
                  <Troubleshoot />
                </ProtectedRoute>
              }
            />
            <Route
              path="/availability"
              element={
                <ProtectedRoute>
                  <Availability />
                </ProtectedRoute>
              }
            />
            <Route
              path="/verify-push"
              element={
                <ProtectedRoute>
                  <VerifyPush />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dev-cache-reset"
              element={
                <ProtectedRoute>
                  <DevCacheReset />
                </ProtectedRoute>
              }
            />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="/contact-support" element={<ProtectedRoute><ContactSupport /></ProtectedRoute>} />
            <Route path="/customer-reviews" element={<ProtectedRoute><CustomerReviews /></ProtectedRoute>} />
            <Route path="/admin-upload-qr" element={<AdminUploadQr />} />
            <Route path="/" element={<Navigate to="/auth" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

const App = () => (
  <AuthProvider>
    <AppInner />
  </AuthProvider>
);

export default App;

