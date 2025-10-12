import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldAlert, Smartphone, Loader2, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import { 
  requestOverlayPermission, 
  checkOverlayPermission,
  openAndroidOverlaySettings 
} from "@/native/overlay";
import { startForegroundService, stopForegroundService } from "@/lib/foregroundService";
import { usePushRegister } from "@/hooks/usePushRegister";

export default function Settings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [hasPermission, setHasPermission] = useState(false);
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const { registerPush, registeredToken, isRegistering } = usePushRegister();
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    checkStatus();
  }, []);

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
        title: "Permission granted",
        description: "You can now enable booking alerts"
      });
    } else {
      toast({
        title: "Permission required",
        description: "Please grant overlay permission in system settings",
        variant: "destructive"
      });
    }
  };

  const handleToggleOverlay = async (enabled: boolean) => {
    if (!hasPermission && enabled) {
      toast({
        title: "Permission required",
        description: "Please grant overlay permission first",
        variant: "destructive"
      });
      return;
    }

    setToggling(true);
    try {
      if (enabled) {
        localStorage.setItem('overlay_mode', 'enabled');
        await startForegroundService();
        toast({
          title: "Booking alerts activated",
          description: "You'll receive overlay alerts for new bookings"
        });
      } else {
        localStorage.removeItem('overlay_mode');
        await stopForegroundService();
        toast({
          title: "Booking alerts deactivated",
          description: "You won't receive overlay alerts"
        });
      }
      setOverlayEnabled(enabled);
    } catch (error: any) {
      toast({
        title: "Error",
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
        title: "Notifications enabled",
        description: "Push notifications registered successfully"
      });
      console.log('FCM Token:', token);
    } catch (error: any) {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive"
      });
      console.error('Push registration error:', error);
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
            <h1 className="text-xl font-bold">Overlay Settings</h1>
            <p className="text-sm text-muted-foreground">Manage booking alerts</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
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
              <h3 className="font-semibold mb-1">Overlay Permission</h3>
              <p className="text-sm text-muted-foreground mb-3">
                {hasPermission 
                  ? "Permission granted. Booking alerts can display over other apps."
                  : "Allow Didi Now to display alerts over other apps like YouTube, WhatsApp, etc."
                }
              </p>
              {!hasPermission && (
                <div className="space-y-2">
                  <Button onClick={handleRequestPermission} className="w-full">
                    <Smartphone className="w-4 h-4 mr-2" />
                    Grant Permission
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={openAndroidOverlaySettings} 
                    className="w-full"
                  >
                    Open Overlay Settings
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
                Stay Ready for Booking Alerts
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Receive instant overlay alerts when new bookings arrive, even while using other apps
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
            How it works
          </h3>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
            <li>• Booking alerts appear over other apps</li>
            <li>• 30-second countdown to accept or reject</li>
            <li>• Background service keeps you connected</li>
            <li>• Works even when screen is off</li>
          </ul>
        </Card>

        {/* Push Notifications */}
        <Card className="p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <Bell className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Push Notifications</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Register for booking alerts and updates
              </p>
              
              {!isNative && (
                <p className="text-xs text-muted-foreground mb-3 italic">
                  Use the installed Android app to enable notifications.
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
                    Registering...
                  </>
                ) : (
                  "Register Push Notifications"
                )}
              </Button>

              {registeredToken && (
                <div className="space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowToken(!showToken)}
                    className="w-full"
                  >
                    {showToken ? "Hide Token" : "View My Token"}
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

        {/* Troubleshoot Link */}
        <Button
          variant="outline"
          onClick={() => navigate("/troubleshoot")}
          className="w-full"
        >
          Troubleshoot Issues
        </Button>
      </main>
    </div>
  );
}
