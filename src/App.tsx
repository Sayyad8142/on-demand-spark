import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import OneSignal from "onesignal-cordova-plugin";
import { useAuth } from "@/hooks/useAuth";
import { initOneSignal, ONESIGNAL_APP_ID } from "@/lib/onesignal";
import { registerWebPush } from "@/push/webPush";
import { requestAndroidOverlay } from "@/lib/androidOverlay";
import { startForegroundService, stopForegroundService } from "@/lib/foregroundService";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import Bookings from "./pages/Bookings";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

const App = () => {
  const { session } = useAuth();

  // OneSignal will handle permission in initOneSignal - no need for duplicate logic

  // Register push notifications (native or web)
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    console.log("Registering push notifications for user:", userId);
    
    if (Capacitor.isNativePlatform()) {
      console.log("Initializing OneSignal for native platform");
      initOneSignal(userId);
      
      // Request overlay permission on Android after login
      if (Capacitor.getPlatform() === 'android') {
        requestAndroidOverlay();
      }
    } else {
      console.log("Registering web push notifications");
      registerWebPush(userId);
    }
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
                <ProtectedRoute>
                  <Home />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bookings"
              element={
                <ProtectedRoute>
                  <Bookings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
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
