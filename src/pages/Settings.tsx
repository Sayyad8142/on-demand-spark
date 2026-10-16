import { displayText, useWorkerLanguage, serviceLabel, bookingStatusLabel, displayLocale } from "@/i18n/display";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldAlert, Smartphone, Loader2, Bell, Bug, Send, Download, Check, RefreshCw, Wallet, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { Capacitor } from "@capacitor/core";
import { 
  requestOverlayPermission, 
  checkOverlayPermission,
  openAndroidOverlaySettings 
} from "@/native/overlay";
import { usePushRegister } from "@/hooks/usePushRegister";
import { supabase } from "@/integrations/supabase/client";
import { SimulatedOverlayModal } from "@/components/SimulatedOverlayModal";
import { checkForUpdate, downloadAndApplyUpdate, getCurrentBundleVersion, type UpdateCheckResult } from "@/lib/liveUpdate";

export default function Settings() {
  useWorkerLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { worker } = useWorkerProfile(user?.id);
  const { registerPush, checkRegistrationStatus, registeredToken, isRegistering, lastSyncTime } = usePushRegister();
  const [hasPermission, setHasPermission] = useState(false);
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testingServerPush, setTestingServerPush] = useState(false);
  const [simulatedBooking, setSimulatedBooking] = useState<any>(null);
  const [otaStatus, setOtaStatus] = useState<string>('');
  const [otaChecking, setOtaChecking] = useState(false);
  const [otaUpdating, setOtaUpdating] = useState(false);
  const [otaResult, setOtaResult] = useState<UpdateCheckResult | null>(null);
  const [currentBundleVersion, setCurrentBundleVersion] = useState<string>('');
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    checkStatus();
    if (user?.id) {
      checkRegistrationStatus();
    }
    // Load current bundle version
    getCurrentBundleVersion().then(v => setCurrentBundleVersion(v));
  }, [user?.id, checkRegistrationStatus]);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const granted = await checkOverlayPermission();
      setHasPermission(granted);
      setOverlayEnabled(localStorage.getItem('overlay_mode') === 'enabled');
    } catch (error) {
      console.error('Error checking status:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleRequestPermission = async () => {
    const granted = await requestOverlayPermission();
    setHasPermission(granted);
    
    if (granted) {
      toast({
        title: displayText("Permission granted"),
        description: displayText("You can now enable booking alerts")
      });
    } else {
      toast({
        title: displayText("Permission required"),
        description: displayText("Please grant overlay permission in system settings"),
        variant: "destructive"
      });
    }
  };

  const handleToggleOverlay = async (enabled: boolean) => {
    if (!hasPermission && enabled) {
      toast({
        title: displayText("Permission required"),
        description: displayText("Please grant overlay permission first"),
        variant: "destructive"
      });
      return;
    }

    setToggling(true);
    try {
      if (enabled) {
        localStorage.setItem('overlay_mode', 'enabled');
        toast({
          title: displayText("Booking alerts activated"),
          description: displayText("You'll receive overlay alerts for new bookings")
        });
      } else {
        localStorage.removeItem('overlay_mode');
        toast({
          title: displayText("Booking alerts deactivated"),
          description: displayText("You won't receive overlay alerts")
        });
      }
      setOverlayEnabled(enabled);
    } catch (error: any) {
      toast({
        title: displayText("Error"),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setToggling(false);
    }
  };

  const handleRegisterPush = async () => {
    try {
      const token = await registerPush();
      toast({
        title: displayText("Notifications enabled"),
        description: displayText("Push notifications registered successfully")
      });
      console.log('FCM Token:', token);
    } catch (error: any) {
      toast({
        title: displayText("Registration failed"),
        description: error.message,
        variant: "destructive"
      });
      console.error('Push registration error:', error);
    }
  };
  const handleCheckOtaUpdate = async () => {
    setOtaChecking(true);
    setOtaStatus('Checking...');
    try {
      const result = await checkForUpdate();
      setOtaResult(result);
      setCurrentBundleVersion(result.currentVersion);
      if (result.updateAvailable) {
        setOtaStatus(`Update ${result.latestVersion} available!`);
      } else {
        setOtaStatus('You are up to date ✓');
      }
    } catch (err) {
      setOtaStatus('Check failed');
    } finally {
      setOtaChecking(false);
    }
  };

  const handleApplyOtaUpdate = async () => {
    if (!otaResult?.bundleInfo) return;
    setOtaUpdating(true);
    const success = await downloadAndApplyUpdate(otaResult.bundleInfo, setOtaStatus);
    if (!success) {
      setOtaUpdating(false);
      toast({
        title: displayText("Update failed"),
        description: displayText("Could not apply update. Try again later."),
        variant: "destructive"
      });
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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
          <div>
            <h1 className="text-xl font-bold">{displayText("Overlay Settings")}</h1>
            <p className="text-sm text-muted-foreground">{displayText("Manage booking alerts")}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Earnings & Payouts */}
        <Card className="border-0 shadow-lg cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => navigate('/earnings')}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{displayText("Earnings & Payouts")}</p>
                  <p className="text-xs text-muted-foreground">{displayText("Track your instant UPI payouts")}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        {/* Permission Status */}
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              hasPermission ? 'bg-green-100 dark:bg-green-900' : 'bg-yellow-100 dark:bg-yellow-900'
            }`}>
              <ShieldAlert className={`w-6 h-6 ${
                hasPermission ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
              }`} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">{displayText("Overlay Permission")}</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {hasPermission 
                  ? displayText("Permission granted. Booking alerts can display over other apps.")
                  : "Allow Didi Now to display alerts over other apps like YouTube, WhatsApp, etc."
                }
              </p>
              {!hasPermission && (
                <div className="space-y-2">
                  <Button onClick={handleRequestPermission} className="w-full">
                    <Smartphone className="w-4 h-4 mr-2" />
                    {displayText("Grant Permission")}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={openAndroidOverlaySettings} 
                    className="w-full"
                  >
                    {displayText("Open Overlay Settings")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Overlay Toggle */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 pr-4">
              <Label htmlFor="overlay-mode" className="text-base font-semibold">
                {displayText("Stay Ready for Booking Alerts")}
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                {displayText("Receive instant overlay alerts when new bookings arrive, even while using other apps")}
              </p>
            </div>
            <Switch
              id="overlay-mode"
              checked={overlayEnabled}
              onCheckedChange={handleToggleOverlay}
              disabled={toggling || !hasPermission}
            />
          </div>
        </Card>

        {/* Info Card */}
        <Card className="p-6 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <h3 className="font-semibold mb-2 text-blue-900 dark:text-blue-100">
            {displayText("How it works")}
          </h3>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
            <li>{displayText("• Booking alerts appear over other apps")}</li>
            <li>{displayText("• 30-second countdown to accept or reject")}</li>
            <li>{displayText("• Background service keeps you connected")}</li>
            <li>{displayText("• Works even when screen is off")}</li>
          </ul>
        </Card>

        {/* Push Notifications */}
        <Card className="p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <Bell className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">{displayText("Push Notifications")}</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {displayText("Register for booking alerts and updates")}
              </p>
              
              {!isNative && (
                <p className="text-xs text-muted-foreground mb-3 italic">
                  {displayText("Use the installed Android app to enable notifications.")}
                </p>
              )}

              <Button 
                onClick={handleRegisterPush}
                disabled={!isNative || isRegistering}
                className="w-full mb-2"
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {displayText("Registering...")}
                  </>
                ) : (
                  "Register Push Notifications"
                )}
              </Button>

              {registeredToken && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="bg-green-50 dark:bg-green-900 text-green-700 dark:text-green-300">
                      {displayText("Registered")}
                    </Badge>
                    {lastSyncTime && (
                      <span className="text-xs text-muted-foreground">
                        {displayText("Last sync:")} {lastSyncTime.toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowToken(!showToken)}
                    className="w-full"
                  >
                    {showToken ? displayText("Hide Token") : displayText("View FCM Token")}
                  </Button>
                  
                  {showToken && (
                    <Input 
                      value={registeredToken}
                      readOnly
                      className="text-xs font-mono"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Debug Tools */}
        <Card className="p-6 bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
              <Bug className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">{displayText("Debug Tools")}</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {displayText("Test push notifications and check worker status")}
              </p>
              
              <div className="space-y-2 mb-3 text-xs font-mono bg-orange-100 dark:bg-orange-900/50 p-3 rounded">
                <div><strong>{displayText("User ID:")}</strong> {user?.id?.slice(0, 8)}...</div>
                <div><strong>{displayText("Worker ID:")}</strong> {worker?.id?.slice(0, 8)}...</div>
                <div><strong>{displayText("Community:")}</strong> {worker?.community || 'N/A'}</div>
                <div><strong>{displayText("Services:")}</strong> {worker?.service_types?.map(serviceLabel).join(', ') || 'N/A'}</div>
                <div><strong>FCM Token:</strong> {worker?.fcm_token ? displayText("✅ Set") : displayText("❌ Not set")}</div>
              </div>

              <Button 
                variant="outline" 
                onClick={handleRegisterPush}
                disabled={isRegistering}
                className="w-full"
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {displayText("Re-registering...")}
                  </>
                ) : (
                  "Re-register Push Token"
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* App Updates (OTA) */}
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Download className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">{displayText("App Updates")}</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {displayText("Check for the latest app improvements")}
              </p>
              
              <div className="text-xs font-mono bg-muted p-3 rounded mb-3 space-y-1">
                <div><strong>{displayText("Current version:")}</strong> {currentBundleVersion || '...'}</div>
                {otaResult?.latestVersion && (
                  <div><strong>{displayText("Latest available:")}</strong> {otaResult.latestVersion}</div>
                )}
                {otaStatus && (
                  <div className="mt-1 font-sans font-medium">{otaStatus}</div>
                )}
              </div>

              <div className="space-y-2">
                <Button
                  onClick={handleCheckOtaUpdate}
                  disabled={otaChecking || otaUpdating}
                  variant="outline"
                  className="w-full"
                >
                  {otaChecking ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {displayText("Checking...")}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      {displayText("Check for Updates")}
                    </>
                  )}
                </Button>

                {otaResult?.updateAvailable && (
                  <Button
                    onClick={handleApplyOtaUpdate}
                    disabled={otaUpdating}
                    className="w-full"
                  >
                    {otaUpdating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {displayText("Updating...")}
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        {displayText("Update to")} {otaResult.latestVersion}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Troubleshoot Link */}
        <Button
          variant="outline"
          onClick={() => navigate("/troubleshoot")}
          className="w-full"
        >
          {displayText("Troubleshoot Issues")}
        </Button>
      </main>
    </div>
  );
}
