import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { useAuth } from "@/hooks/useAuth";
import { useAppState } from "@/hooks/useAppState";
import { initNativePush } from "@/native/push";
import { requestAndroidOverlay } from "@/lib/overlay";
import { startForegroundService, stopForegroundService } from "@/lib/foregroundService";
import { tryAccept } from "@/lib/bookingActions";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import Bookings from "./pages/Bookings";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Troubleshoot from "./pages/Troubleshoot";
import VerifyPush from "./pages/VerifyPush";
import DevCacheReset from "./pages/DevCacheReset";
import NotFound from "./pages/NotFound";
import BottomNav from "./components/BottomNav";

const queryClient = new QueryClient();

function ProtectedRoute({ children, showNav = false }: { children: React.ReactNode; showNav?: boolean }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
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

const App = () => {
  const { session } = useAuth();
  useAppState(); // Refresh JWT when app comes to foreground

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

  // Start/stop foreground service based on login state
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return;
    }

    if (session?.user) {
      // User is logged in - start foreground service
      console.log("User logged in, starting foreground service");
      startForegroundService();
    } else {
      // User is logged out - stop foreground service
      console.log("User logged out, stopping foreground service");
      stopForegroundService();
    }
  }, [session?.user]);

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
            const ok = await tryAccept(bookingId);
            if (!ok) console.warn('Booking already taken or accept failed');
          }
        }
      } catch (e) {
        console.error('appUrlOpen parse error', e);
      }
    });
    return () => { sub.then(s => s.remove()); };
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

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
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
            <Route path="/" element={<Navigate to="/auth" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
