import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Smartphone, Battery, Power, Bell, AlertTriangle, TestTube, Key, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { useToast } from "@/hooks/use-toast";
import { usePushRegister } from "@/hooks/usePushRegister";
import { supabase } from "@/integrations/supabase/client";
import { ensureServiceWorker, subscribeWebPush } from "@/push/webPush";
import { Capacitor } from '@capacitor/core';

// VAPID public key from environment variable
const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

export default function Troubleshoot() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { worker } = useWorkerProfile(user?.id);
  const { toast } = useToast();
  const { registerPush, isRegistering } = usePushRegister();
  const [enabling, setEnabling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<{saved: boolean, preview?: string} | null>(null);
  const [pushTokenStatus, setPushTokenStatus] = useState<{
    hasToken: boolean;
    token?: string;
    inDatabase: boolean;
    lastCheck?: string;
  } | null>(null);
  const [checkingPush, setCheckingPush] = useState(false);

  // Check FCM/Push token status
  const checkPushStatus = async () => {
    if (!user) return;
    
    setCheckingPush(true);
    try {
      console.log('🔍 Checking push notification status...');
      
      // Check database for tokens
      const { data: workerData } = await supabase
        .from('workers')
        .select('fcm_token, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();
      
      const { data: fcmData } = await supabase
        .from('fcm_tokens')
        .select('token, updated_at')
        .eq('user_id', user.id)
        .maybeSingle();
      
      const token = workerData?.fcm_token || fcmData?.token;
      const inDatabase = !!(workerData?.fcm_token || fcmData?.token);
      
      console.log('📊 Push status:', {
        hasToken: !!token,
        inDatabase,
        tokenPreview: token ? token.substring(0, 30) + '...' : 'None'
      });
      
      setPushTokenStatus({
        hasToken: !!token,
        token,
        inDatabase,
        lastCheck: new Date().toLocaleTimeString()
      });
      
      if (!inDatabase) {
        toast({
          title: "⚠️ No Push Token",
          description: "Push notifications are not registered. Enable them below.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "✅ Token Found",
          description: "Push notifications are registered"
        });
      }
    } catch (error) {
      console.error('❌ Push check error:', error);
      toast({
        title: "Error",
        description: "Failed to check push status",
        variant: "destructive"
      });
    } finally {
      setCheckingPush(false);
    }
  };

  useEffect(() => {
    if (user) {
      checkPushStatus();
    }
  }, [user]);

  // Check if JWT is saved (Android only)
  useEffect(() => {
    const checkToken = async () => {
      if (!Capacitor.isNativePlatform()) return;
      
      try {
        // @ts-ignore - Capacitor bridge
        const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;
        if (AuthBridge) {
          const result = await AuthBridge.getToken();
          const token = result?.token;
          setTokenStatus({
            saved: !!token,
            preview: token ? `${token.substring(0, 20)}...` : undefined
          });
        }
      } catch (error) {
        console.error('Failed to check token:', error);
      }
    };

    checkToken();
  }, [user]);

  const openBatterySettings = () => {
    // Open settings - implementation depends on native plugin if needed
    console.log('Open battery settings');
  };

  const openAutoStartSettings = () => {
    // Open settings - implementation depends on native plugin if needed
    console.log('Open auto-start settings');
  };

  const setupWebPush = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "Please sign in first",
        variant: "destructive"
      });
      return;
    }

    try {
      setEnabling(true);
      
      const supported = await ensureServiceWorker();
      if (!supported) {
        toast({
          title: "Not Supported",
          description: "Web Push is not supported on this browser",
          variant: "destructive"
        });
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast({
          title: "Permission Denied",
          description: "Please allow notifications to enable Web Push",
          variant: "destructive"
        });
        return;
      }

      await subscribeWebPush(user.id, VAPID_PUBLIC);
      
      toast({
        title: "Success",
        description: "Web Push notifications enabled successfully!"
      });
    } catch (error: any) {
      console.error("Web Push setup error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to enable Web Push",
        variant: "destructive"
      });
    } finally {
      setEnabling(false);
    }
  };

  const testNativeOverlay = async () => {
    if (!Capacitor.isNativePlatform()) {
      toast({
        title: "Not Available",
        description: "Native overlay only works on Android app",
        variant: "destructive"
      });
      return;
    }

    try {
      // @ts-ignore - Capacitor bridge
      const { OverlayPlugin } = (window as any).Capacitor?.Plugins || {};
      
      if (!OverlayPlugin) {
        toast({
          title: "Error",
          description: "OverlayPlugin not available",
          variant: "destructive"
        });
        return;
      }

      // Check permission first
      const { granted } = await OverlayPlugin.checkPermission();
      if (!granted) {
        toast({
          title: "Permission Required",
          description: "Requesting overlay permission...",
        });
        const result = await OverlayPlugin.requestPermission();
        if (!result.granted) {
          toast({
            title: "Permission Denied",
            description: "Overlay permission is required to show booking alerts",
            variant: "destructive"
          });
          return;
        }
      }

      // Show test overlay
      const testBooking = {
        id: 'test-' + Date.now(),
        service_type: 'Test Service',
        cust_name: 'Test Customer',
        community: 'Test Community',
        flat_no: '101',
        price_inr: 500,
      };

      await OverlayPlugin.showBookingOverlay({ 
        booking: JSON.stringify(testBooking)
      });

      console.log('✅ Test overlay triggered');
      toast({
        title: "Overlay Triggered",
        description: "Check if the overlay appeared on screen",
      });
    } catch (error: any) {
      console.error('❌ Test overlay failed:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to show test overlay",
        variant: "destructive"
      });
    }
  };

  const createTestBooking = async () => {
    if (!user || !worker) {
      toast({
        title: "Error",
        description: "Worker profile not found",
        variant: "destructive"
      });
      return;
    }

    try {
      setTesting(true);

      // Get first service type from worker
      const serviceType = worker.service_types?.[0] || 'maid';
      const community = worker.community || 'prestige-high-fields';

      const { data, error } = await supabase
        .from('bookings')
        .insert({
          user_id: user.id,
          status: 'pending',
          service_type: serviceType,
          booking_type: 'instant',
          community: community,
          flat_no: 'Test-101',
          cust_name: 'Test Customer',
          cust_phone: '9999999999',
          price_inr: 500,
        })
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Test booking created:', data);
      toast({
        title: "Test Booking Created",
        description: "Modal should appear within ~1 second if you're online. Check for Web Push notification if tab is unfocused."
      });
    } catch (error: any) {
      console.error('❌ Failed to create test booking:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create test booking",
        variant: "destructive"
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-primary-soft">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Troubleshooting</h1>
            <p className="text-sm text-muted-foreground">Fix common issues</p>
            <div className="flex gap-2 mt-1">
              <Link to="/verify-push" className="text-xs underline hover:opacity-80">Verify Push</Link>
              <Link to="/dev-cache-reset" className="text-xs underline hover:opacity-80">Dev Cache Reset</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Push Notification Status */}
        <Card className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-green-200 dark:border-green-800">
          <div className="flex gap-3">
            <Bell className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="font-semibold mb-2 text-green-900 dark:text-green-100">
                Push Notification Status
              </h3>
              {pushTokenStatus === null || checkingPush ? (
                <p className="text-sm text-green-700 dark:text-green-300">Checking...</p>
              ) : pushTokenStatus.inDatabase ? (
                <div>
                  <p className="text-sm text-green-700 dark:text-green-300 mb-2">
                    ✅ Push notifications are registered and active
                  </p>
                  <div className="bg-green-100 dark:bg-green-900 p-3 rounded-lg space-y-2">
                    <p className="text-xs font-medium text-green-900 dark:text-green-100">Token Info:</p>
                    <p className="text-xs font-mono text-green-800 dark:text-green-200 break-all">
                      {pushTokenStatus.token?.substring(0, 50)}...
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-300">
                      Last checked: {pushTokenStatus.lastCheck}
                    </p>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      onClick={checkPushStatus}
                      disabled={checkingPush}
                      size="sm"
                      variant="outline"
                      className="flex-1"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${checkingPush ? 'animate-spin' : ''}`} />
                      Re-check
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          await registerPush();
                          toast({
                            title: "✅ Token Refreshed",
                            description: "FCM token has been re-registered successfully"
                          });
                          await checkPushStatus();
                        } catch (error: any) {
                          console.error('❌ Token refresh error:', error);
                          toast({
                            title: "Error",
                            description: error.message || "Failed to refresh token",
                            variant: "destructive"
                          });
                        }
                      }}
                      disabled={isRegistering}
                      size="sm"
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${isRegistering ? 'animate-spin' : ''}`} />
                      Refresh Token
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-red-700 dark:text-red-300 mb-2">
                    ❌ No push token found - notifications will not work
                  </p>
                  <div className="bg-red-100 dark:bg-red-900 p-3 rounded-lg mb-3">
                    <p className="text-xs font-medium mb-2 text-red-900 dark:text-red-100">To fix this:</p>
                    <ol className="text-xs text-red-700 dark:text-red-300 space-y-1">
                      <li>1. Enable {Capacitor.isNativePlatform() ? 'FCM notifications below' : 'Web Push below'}</li>
                      <li>2. Grant notification permissions when prompted</li>
                      <li>3. Re-check status to verify</li>
                    </ol>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={checkPushStatus}
                      disabled={checkingPush}
                      size="sm"
                      variant="outline"
                      className="flex-1"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${checkingPush ? 'animate-spin' : ''}`} />
                      Check Again
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          await registerPush();
                          toast({
                            title: "✅ Token Registered",
                            description: "FCM token has been registered successfully"
                          });
                          await checkPushStatus();
                        } catch (error: any) {
                          console.error('❌ Token registration error:', error);
                          toast({
                            title: "Error",
                            description: error.message || "Failed to register token",
                            variant: "destructive"
                          });
                        }
                      }}
                      disabled={isRegistering}
                      size="sm"
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${isRegistering ? 'animate-spin' : ''}`} />
                      Register Now
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Auth Token Status (Android only) */}
        {Capacitor.isNativePlatform() && (
          <Card className="p-6 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <div className="flex gap-3">
              <Key className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="font-semibold mb-2 text-blue-900 dark:text-blue-100">
                  Authentication Token Status
                </h3>
                {tokenStatus === null ? (
                  <p className="text-sm text-blue-700 dark:text-blue-300">Checking...</p>
                ) : tokenStatus.saved ? (
                  <div>
                    <p className="text-sm text-green-700 dark:text-green-300 mb-2">
                      ✅ JWT token is saved and ready
                    </p>
                    <p className="text-xs font-mono bg-blue-100 dark:bg-blue-900 p-2 rounded text-blue-800 dark:text-blue-200">
                      {tokenStatus.preview}
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-red-700 dark:text-red-300 mb-2">
                      ❌ No JWT token saved - overlay accept will fail
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                      Click below to save your token now:
                    </p>
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          console.log('💾 Manual JWT save triggered');
                          const { data: { session } } = await supabase.auth.getSession();
                          if (session?.access_token) {
                            console.log('🔑 Token found:', session.access_token.substring(0, 30) + '...');
                            // @ts-ignore - Capacitor bridge
                            const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;
                            await AuthBridge.saveToken({ token: session.access_token });
                            
                            // Verify it was saved
                            const verify = await AuthBridge.getToken();
                            if (verify?.token === session.access_token) {
                              console.log('✅ JWT saved and verified');
                              setTokenStatus({
                                saved: true,
                                preview: `${session.access_token.substring(0, 20)}...`
                              });
                              toast({ title: "✅ JWT Saved", description: "Token saved and verified successfully" });
                            } else {
                              console.error('❌ JWT verification failed after save');
                              toast({ title: "⚠️ Verification failed", description: "Token saved but verification failed", variant: "destructive" });
                            }
                          } else {
                            console.error('❌ No session found');
                            toast({ title: "❌ Not logged in", description: "Please log in first", variant: "destructive" });
                          }
                        } catch (error) {
                          console.error('❌ JWT save error:', error);
                          toast({ title: "Error", description: String(error), variant: "destructive" });
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Save JWT Now
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Warning Card */}
        <Card className="p-6 bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
          <div className="flex gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-semibold mb-2 text-yellow-900 dark:text-yellow-100">
                Important for reliable notifications
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Some phone manufacturers restrict background apps. Follow these steps to ensure you never miss a booking.
              </p>
            </div>
          </div>
        </Card>

        {/* Battery Optimization */}
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900 flex items-center justify-center flex-shrink-0">
              <Battery className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Disable Battery Optimization</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Allow Didi Now to run in the background without restrictions
              </p>
              <Button onClick={openBatterySettings} variant="outline" className="w-full">
                Open Battery Settings
              </Button>
              <div className="mt-3 p-3 bg-muted rounded-lg">
                <p className="text-xs font-medium mb-2">Manual Steps:</p>
                <ol className="text-xs text-muted-foreground space-y-1">
                  <li>1. Go to Settings → Apps → Didi Now</li>
                  <li>2. Tap "Battery" or "Battery Usage"</li>
                  <li>3. Select "Unrestricted" or "Don't optimize"</li>
                </ol>
              </div>
            </div>
          </div>
        </Card>

        {/* Auto-start */}
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
              <Power className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Enable Auto-start</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Allow Didi Now to start automatically when your phone restarts
              </p>
              <Button onClick={openAutoStartSettings} variant="outline" className="w-full">
                Open Auto-start Settings
              </Button>
              <div className="mt-3 p-3 bg-muted rounded-lg">
                <p className="text-xs font-medium mb-2">Manual Steps (varies by brand):</p>
                <ol className="text-xs text-muted-foreground space-y-1">
                  <li><strong>Xiaomi/Redmi:</strong> Security → Permissions → Autostart</li>
                  <li><strong>Huawei:</strong> Settings → Apps → App launch</li>
                  <li><strong>Oppo/Realme:</strong> Settings → App Management → Startup Manager</li>
                  <li><strong>Vivo:</strong> Settings → Apps → Autostart</li>
                </ol>
              </div>
            </div>
          </div>
        </Card>

        {/* Test Native Overlay (Android only) */}
        {Capacitor.isNativePlatform() && (
          <Card className="p-6 bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900 flex items-center justify-center flex-shrink-0">
                <TestTube className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1 text-purple-900 dark:text-purple-100">Test Native Overlay</h3>
                <p className="text-sm text-purple-700 dark:text-purple-300 mb-3">
                  Directly test the Android system overlay (bypasses FCM)
                </p>
                <Button 
                  onClick={testNativeOverlay}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Test Overlay Now
                </Button>
                <div className="mt-3 p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <p className="text-xs font-medium mb-2 text-purple-900 dark:text-purple-100">This will:</p>
                  <ul className="text-xs text-purple-700 dark:text-purple-300 space-y-1">
                    <li>✓ Check overlay permission</li>
                    <li>✓ Request permission if needed</li>
                    <li>✓ Show full-screen overlay with test booking</li>
                  </ul>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Test Booking */}
        <Card className="p-6 bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900 flex items-center justify-center flex-shrink-0">
              <TestTube className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1 text-orange-900 dark:text-orange-100">Test Booking Alert</h3>
              <p className="text-sm text-orange-700 dark:text-orange-300 mb-3">
                Create a test booking to verify notification system works
              </p>
              <Button 
                onClick={createTestBooking} 
                disabled={testing || !worker}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              >
                {testing ? "Creating..." : "Create Test Booking"}
              </Button>
              <div className="mt-3 p-3 bg-orange-100 dark:bg-orange-900 rounded-lg">
                <p className="text-xs font-medium mb-2 text-orange-900 dark:text-orange-100">What to verify:</p>
                <ul className="text-xs text-orange-700 dark:text-orange-300 space-y-1">
                  <li>✓ Modal appears within ~1 second when you're Online</li>
                  <li>✓ Web Push notification appears if tab is unfocused</li>
                  <li>✓ Sound plays (if enabled)</li>
                </ul>
              </div>
            </div>
          </div>
        </Card>

        {/* Web Push Notifications */}
        <Card className="p-6 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
              <Bell className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1 text-green-900 dark:text-green-100">Enable Web Push (Browser)</h3>
              <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                Get booking alerts even when the tab is in the background
              </p>
              <Button 
                onClick={setupWebPush} 
                disabled={enabling}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                {enabling ? "Enabling..." : "Enable Web Push"}
              </Button>
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                This allows notifications to work even when the browser tab is not focused
              </p>
            </div>
          </div>
        </Card>

        {/* Notifications */}
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900 flex items-center justify-center flex-shrink-0">
              <Bell className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Enable Notifications</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Ensure notification permissions are granted
              </p>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs font-medium mb-2">Steps:</p>
                <ol className="text-xs text-muted-foreground space-y-1">
                  <li>1. Go to Settings → Apps → Didi Now</li>
                  <li>2. Tap "Notifications"</li>
                  <li>3. Enable "Allow notifications"</li>
                  <li>4. Enable all notification categories</li>
                </ol>
              </div>
            </div>
          </div>
        </Card>

        {/* Device-specific Issues */}
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-2">Device-Specific Settings</h3>
              <div className="space-y-3">
                <details className="p-3 bg-muted rounded-lg">
                  <summary className="text-sm font-medium cursor-pointer">Xiaomi / Redmi / POCO</summary>
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1 pl-4">
                    <li>• Security → Permissions → Autostart → Enable for Didi Now</li>
                    <li>• Battery & Performance → Choose apps → Didi Now → No restrictions</li>
                    <li>• Settings → Notifications → Didi Now → Enable all</li>
                  </ul>
                </details>
                
                <details className="p-3 bg-muted rounded-lg">
                  <summary className="text-sm font-medium cursor-pointer">Huawei / Honor</summary>
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1 pl-4">
                    <li>• Settings → Apps → App launch → Didi Now → Manage manually</li>
                    <li>• Settings → Battery → App launch → Didi Now → Enable all</li>
                    <li>• Phone Manager → Protected apps → Enable Didi Now</li>
                  </ul>
                </details>
                
                <details className="p-3 bg-muted rounded-lg">
                  <summary className="text-sm font-medium cursor-pointer">Oppo / Realme</summary>
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1 pl-4">
                    <li>• Settings → Battery → App Battery Management → Didi Now → Don't optimize</li>
                    <li>• Settings → App Management → Startup Manager → Enable Didi Now</li>
                    <li>• Settings → Privacy → Permission Manager → Enable all for Didi Now</li>
                  </ul>
                </details>
                
                <details className="p-3 bg-muted rounded-lg">
                  <summary className="text-sm font-medium cursor-pointer">Vivo</summary>
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1 pl-4">
                    <li>• Settings → Battery → Background power consumption management → Didi Now → Allow</li>
                    <li>• Settings → More Settings → Applications → Autostart → Enable Didi Now</li>
                    <li>• iManager → App Manager → App list → Didi Now → High background power consumption → Allow</li>
                  </ul>
                </details>
                
                <details className="p-3 bg-muted rounded-lg">
                  <summary className="text-sm font-medium cursor-pointer">Samsung</summary>
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1 pl-4">
                    <li>• Settings → Apps → Didi Now → Battery → Optimize battery usage → All → Didi Now → Disable</li>
                    <li>• Settings → Apps → Didi Now → Mobile data → Allow background data usage</li>
                  </ul>
                </details>
              </div>
            </div>
          </div>
        </Card>

        {/* Still Having Issues */}
        <Card className="p-6 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <h3 className="font-semibold mb-2 text-blue-900 dark:text-blue-100">
            Still having issues?
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
            Make sure you've completed all the steps above. If notifications still don't work:
          </p>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <li>• Restart your phone after changing settings</li>
            <li>• Check if you're online in the app</li>
            <li>• Verify your internet connection</li>
            <li>• Contact support if issues persist</li>
          </ul>
        </Card>
      </main>
    </div>
  );
}
