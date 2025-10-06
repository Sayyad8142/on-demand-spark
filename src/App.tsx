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

  // Request OneSignal notification permission on first app launch (Android)
  useEffect(() => {
    const requestInitialPermission = async () => {
      if (!Capacitor.isNativePlatform()) return;
      
      const permissionRequested = localStorage.getItem('onesignal_permission_requested');
      if (permissionRequested) return;

      if (!ONESIGNAL_APP_ID) return;

      try {
        // Initialize OneSignal first
        OneSignal.initialize(ONESIGNAL_APP_ID);
        OneSignal.Debug.setLogLevel(6);

        // Request permission
        const granted = await OneSignal.Notifications.requestPermission(true);
        
        if (granted) {
          console.log("✅ Notification permission granted");
        } else {
          console.log("❌ Notification permission denied");
        }

        // Mark as requested to avoid asking again
        localStorage.setItem('onesignal_permission_requested', 'true');
      } catch (error) {
        console.error("Error requesting notification permission:", error);
        localStorage.setItem('onesignal_permission_requested', 'true');
      }
    };

    requestInitialPermission();
  }, []);

  // Register push notifications (native or web)
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    console.log("Registering push notifications for user:", userId);
    
    if (Capacitor.isNativePlatform()) {
      console.log("Initializing OneSignal for native platform");
      initOneSignal(userId);
    } else {
      console.log("Registering web push notifications");
      registerWebPush(userId);
    }
  }, [session?.user?.id]);

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
