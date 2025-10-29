import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { useBookingAlerts } from "@/hooks/useBookingAlerts";
import { useActiveJob } from "@/hooks/useActiveJob";
import { BookingAlertModal } from "@/components/BookingAlertModal";
import ActiveJobCard from "@/components/ActiveJobCard";
import AvailabilityToggle from "@/components/AvailabilityToggle";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bell, X } from "lucide-react";
import { Capacitor } from '@capacitor/core';
import { supabase } from "@/integrations/supabase/client";

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

export default function Home() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { worker, updateAvailability, refetch: refetchWorker } = useWorkerProfile(user?.id);
  const { activeJob, updateJobStatus, refetch: refetchActiveJob } = useActiveJob(user?.id);
  const [toggling, setToggling] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showWebPushBanner, setShowWebPushBanner] = useState(false);
  
  const isOnline = !!worker?.is_available;

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
          await AuthBridge.saveToken({ token: session.access_token });
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

  const matches = (b:any) => {
    const inService = worker?.service_types?.includes?.(b.service_type);
    const inCommunity = (worker?.communities || [worker?.community]).includes?.(b.community);
    return !!(inService && inCommunity);
  };

  const { pending, accept, reject, clearAlert } = useBookingAlerts(user?.id, isOnline, matches);

  const handleToggle = async (value: boolean) => {
    setToggling(true);
    await updateAvailability(value);
    setToggling(false);
  };

  const handleStatusUpdate = async (status: string) => {
    setUpdating(true);
    await updateJobStatus(activeJob?.id, status);
    await refetchWorker();
    setUpdating(false);
  };

  const handleAccept = async () => {
    await accept();
    await Promise.all([refetchActiveJob(), refetchWorker()]);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header 
        workerName={worker?.full_name} 
        communityName={worker?.community}
      />
      <div className="flex-1 p-4 space-y-4">
      {/* Web Push Banner */}
      {showWebPushBanner && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 relative">
          <button
            onClick={() => setShowWebPushBanner(false)}
            className="absolute top-2 right-2 p-1 hover:bg-blue-100 dark:hover:bg-blue-900 rounded"
          >
            <X className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </button>
          <div className="flex items-start gap-3 pr-6">
            <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-sm text-blue-900 dark:text-blue-100 mb-1">
                Enable Web Push Notifications
              </h3>
              <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                Get booking alerts even when this tab is in the background
              </p>
              <Button
                size="sm"
                onClick={() => {
                  setShowWebPushBanner(false);
                  navigate('/troubleshoot');
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs"
              >
                Enable in Settings
              </Button>
            </div>
          </div>
        </Card>
      )}
      
      <AvailabilityToggle isOnline={isOnline} onToggle={handleToggle} disabled={toggling} />
      {activeJob && <ActiveJobCard booking={activeJob} onStatusUpdate={handleStatusUpdate} updating={updating} />}
      
      {/* Only show in-app modal on web platform; Android uses native overlay */}
      {!Capacitor.isNativePlatform() && (
        <BookingAlertModal
          open={!!pending}
          booking={pending}
          onAccept={handleAccept}
          onReject={reject}
          onClose={clearAlert}
        />
      )}
      </div>
    </div>
  );
}
