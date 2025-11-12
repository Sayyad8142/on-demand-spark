import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { useBookingAlerts } from "@/hooks/useBookingAlerts";
import { useActiveJob } from "@/hooks/useActiveJob";
import { useIncomingCall } from "@/hooks/useIncomingCall";
import { BookingAlertModal } from "@/components/BookingAlertModal";
import IncomingCallScreen from "@/components/IncomingCallScreen";
import CallScreen from "@/components/CallScreen";
import ActiveJobCard from "@/components/ActiveJobCard";
import { AvailabilityToggle } from "@/components/AvailabilityToggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bell, X, Info } from "lucide-react";
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;
export default function Home() {
  const navigate = useNavigate();
  const {
    t
  } = useTranslation();
  const {
    user,
    session
  } = useAuth();
  const {
    worker,
    updateAvailability,
    refetch: refetchWorker
  } = useWorkerProfile(user?.id);
  const {
    activeJob,
    updateJobStatus,
    refetch: refetchActiveJob
  } = useActiveJob(user?.id);
  const [toggling, setToggling] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [showWebPushBanner, setShowWebPushBanner] = useState(false);
  const [showDemoBanner, setShowDemoBanner] = useState(false);
  const [isInCall, setIsInCall] = useState(false);
  const [callRoomUrl, setCallRoomUrl] = useState('');
  const [callToken, setCallToken] = useState('');
  const [callId, setCallId] = useState('');
  const isOnline = !!worker?.is_available;
  const { toast } = useToast();
  const { incomingCall, dismissCall } = useIncomingCall();

  // Debug function to test overlay
  const testOverlay = async () => {
    console.log('🔵 ========== OVERLAY TEST STARTED ==========');
    console.log('🔵 Platform:', Capacitor.getPlatform());
    console.log('🔵 Is Native:', Capacitor.isNativePlatform());
    
    if (!Capacitor.isNativePlatform()) {
      toast({ title: "Not Native", description: "Overlay only works on Android app", variant: "destructive" });
      return;
    }

    try {
      // @ts-ignore - Capacitor bridge
      const { OverlayPlugin } = (window as any).Capacitor?.Plugins || {};
      console.log('🔌 OverlayPlugin:', OverlayPlugin ? 'Found ✅' : 'Not found ❌');
      console.log('🔌 Available methods:', OverlayPlugin ? Object.keys(OverlayPlugin) : 'N/A');
      
      if (!OverlayPlugin) {
        toast({ title: "Plugin Error", description: "OverlayPlugin not available", variant: "destructive" });
        return;
      }

      // Check permission
      console.log('🔍 Checking overlay permission...');
      const permCheck = await OverlayPlugin.checkPermission();
      console.log('🔍 Permission result:', permCheck);
      
      if (!permCheck.granted) {
        console.log('⚠️ Permission not granted, requesting...');
        toast({ title: "Permission Required", description: "Requesting overlay permission..." });
        const permReq = await OverlayPlugin.requestPermission();
        console.log('📝 Permission request result:', permReq);
        
        if (!permReq.granted) {
          toast({ title: "Permission Denied", description: "Cannot show overlay without permission", variant: "destructive" });
          return;
        }
      }

      console.log('✅ Permission granted');

      // Prepare test booking data
      const testBooking = {
        id: 'test-' + Date.now(),
        service_type: 'Test Cook Service',
        cust_name: 'Test Customer',
        community: 'Test Community',
        flat_no: 'A-101',
        price_inr: 500,
      };

      console.log('📦 Test booking data:', testBooking);
      const bookingJson = JSON.stringify(testBooking);
      console.log('📦 Booking JSON:', bookingJson);
      console.log('🚀 Calling showBookingOverlay...');

      await OverlayPlugin.showBookingOverlay({ booking: bookingJson });

      console.log('✅ ========== OVERLAY TRIGGERED SUCCESSFULLY ==========');
      toast({ title: "Overlay Triggered", description: "Check your screen for the overlay", duration: 5000 });
    } catch (error: any) {
      console.error('❌ ========== OVERLAY TEST FAILED ==========');
      console.error('❌ Error:', error);
      console.error('❌ Error message:', error?.message);
      console.error('❌ Error stack:', error?.stack);
      toast({ title: "Error", description: error?.message || "Failed to show overlay", variant: "destructive" });
    }
  };

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
          await AuthBridge.saveToken({
            token: session.access_token
          });
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

  // Check if this is demo user
  useEffect(() => {
    const isDemo = localStorage.getItem('is_demo_user') === 'true';
    if (isDemo) {
      const dismissed = sessionStorage.getItem('demo_banner_dismissed');
      if (!dismissed) {
        setShowDemoBanner(true);
      }
    }
  }, []);
  const matches = (b: any) => {
    const inService = worker?.service_types?.includes?.(b.service_type);
    const inCommunity = (worker?.communities || [worker?.community]).includes?.(b.community);
    return !!(inService && inCommunity);
  };
  const {
    pending,
    accept,
    reject,
    clearAlert
  } = useBookingAlerts(user?.id, isOnline, matches);
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

  const handleCall = async () => {
    if (!activeJob) return;

    try {
      console.log('📞 Initiating call for booking:', activeJob.id);
      toast({
        title: 'Connecting...',
        description: 'Starting call, please wait',
      });

      const { data, error } = await supabase.functions.invoke('create-rtc-call', {
        body: { booking_id: activeJob.id },
      });

      if (error) throw error;

      setCallRoomUrl(data.room_url);
      setCallToken(data.caller_token);
      setCallId(data.rtc_call_id);
      setIsInCall(true);

      console.log('✅ Call initiated:', data.rtc_call_id);
    } catch (error) {
      console.error('❌ Failed to start call:', error);
      toast({
        title: 'Call Failed',
        description: error instanceof Error ? error.message : 'Failed to start call',
        variant: 'destructive',
      });
    }
  };

  const handleCallEnd = () => {
    setIsInCall(false);
    setCallRoomUrl('');
    setCallToken('');
    setCallId('');
  };

  // Guard: Don't render if user is not loaded yet
  if (!user) {
    return <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>;
  }

  // Show incoming call screen
  if (incomingCall) {
    return (
      <IncomingCallScreen
        rtcCallId={incomingCall.rtcCallId}
        callerName={incomingCall.callerName}
        onDismiss={dismissCall}
      />
    );
  }

  // Show active call screen
  if (isInCall && callRoomUrl && callToken && callId) {
    return (
      <CallScreen
        roomUrl={callRoomUrl}
        token={callToken}
        userName={worker?.full_name || 'Worker'}
        rtcCallId={callId}
        onCallEnd={handleCallEnd}
      />
    );
  }

  return <div className="min-h-screen">
      {/* Fixed Availability Toggle */}
      <div className="fixed top-0 left-0 right-0 z-10 bg-background border-b border-border">
        <div className="p-4">
          <AvailabilityToggle workerId={user.id} />
        </div>
      </div>

      {/* Main Content with top padding for fixed header */}
      <div className="p-4 space-y-4 pb-32 pt-28">
      
      {/* Demo Mode Banner */}
      {showDemoBanner && (
        <Card className="p-4 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 relative">
          <button 
            onClick={() => {
              setShowDemoBanner(false);
              sessionStorage.setItem('demo_banner_dismissed', 'true');
            }} 
            className="absolute top-2 right-2 p-1 hover:bg-amber-100 dark:hover:bg-amber-900 rounded"
          >
            <X className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </button>
          <div className="flex items-center gap-3 pr-6">
            <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-sm text-amber-900 dark:text-amber-100">
                Demo Mode (For Review Only)
              </h3>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                You're using a test account. This is for Play Store review purposes only.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Web Push Banner */}
      {showWebPushBanner && <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 relative">
          <button onClick={() => setShowWebPushBanner(false)} className="absolute top-2 right-2 p-1 hover:bg-blue-100 dark:hover:bg-blue-900 rounded">
            <X className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </button>
          <div className="flex items-start gap-3 pr-6">
            <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-sm text-blue-900 dark:text-blue-100 mb-1">
                {t('home.enableWebPush')}
              </h3>
              <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                {t('home.enableWebPushDesc')}
              </p>
              <Button size="sm" onClick={() => {
              setShowWebPushBanner(false);
              navigate('/troubleshoot');
            }} className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs">
                {t('home.enableInSettings')}
              </Button>
            </div>
          </div>
        </Card>}

      {activeJob && <ActiveJobCard booking={activeJob} onStatusUpdate={handleStatusUpdate} updating={updating} onCall={handleCall} />}
      
      {/* Only show in-app modal on web platform; Android uses native overlay */}
      {!Capacitor.isNativePlatform() && <BookingAlertModal open={!!pending} booking={pending} onAccept={handleAccept} onReject={reject} onClose={clearAlert} />}
      </div>
    </div>;
}