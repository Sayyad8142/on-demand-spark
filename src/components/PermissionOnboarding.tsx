import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Bell, Layers, BatteryCharging, Activity, Check, X, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  type PermissionId,
  type PermissionState,
  checkAllPermissions,
  hasOutstandingPermissions,
  requestNotificationPermission,
  requestOverlay,
  requestBatteryExemption,
  requestActivity,
} from "@/lib/permissions";

interface PermissionMeta {
  title: string;
  reason: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const META: Record<PermissionId, PermissionMeta> = {
  notifications: {
    title: "Notifications",
    reason: "So you receive booking alerts the moment they arrive.",
    Icon: Bell,
  },
  overlay: {
    title: "Display over other apps",
    reason: "Shows new bookings as a popup even when the app is in background.",
    Icon: Layers,
  },
  battery: {
    title: "Battery optimization",
    reason: "Keeps booking alerts working reliably when your phone is idle.",
    Icon: BatteryCharging,
  },
  activity: {
    title: "Physical activity",
    reason: "Helps verify you've started moving after accepting a booking.",
    Icon: Activity,
  },
};

interface PermissionOnboardingProps {
  onComplete: () => void;
}

export default function PermissionOnboarding({ onComplete }: PermissionOnboardingProps) {
  const [states, setStates] = useState<PermissionState[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<PermissionId | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await checkAllPermissions();
    setStates(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-check when user returns from system Settings
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      const onVis = () => { if (document.visibilityState === "visible") refresh(); };
      document.addEventListener("visibilitychange", onVis);
      return () => document.removeEventListener("visibilitychange", onVis);
    }
    const sub = CapApp.addListener("appStateChange", (s) => {
      if (s.isActive) refresh();
    });
    return () => { sub.then(s => s.remove()); };
  }, [refresh]);

  const handleRequest = async (id: PermissionId) => {
    console.log(`[PermissionOnboarding] 👆 Enable tapped — id=${id}, native=${Capacitor.isNativePlatform()}`);
    // On web preview these only work on a real Android build
    if (id !== "notifications" && !Capacitor.isNativePlatform()) {
      toast({
        title: "Available on Android only",
        description: "This permission can only be enabled on the installed Android app.",
      });
      return;
    }
    setBusyId(id);
    try {
      switch (id) {
        case "notifications":
          console.log("[PermissionOnboarding] → requestNotificationPermission()");
          await requestNotificationPermission();
          break;
        case "overlay":
          console.log("[PermissionOnboarding] → requestOverlay()");
          await requestOverlay();
          break;
        case "battery":
          console.log("[PermissionOnboarding] → requestBatteryExemption()");
          await requestBatteryExemption();
          break;
        case "activity":
          console.log("[PermissionOnboarding] → requestActivity()");
          await requestActivity();
          break;
      }
      console.log(`[PermissionOnboarding] ✅ ${id} request returned without throwing`);
    } catch (e) {
      console.error(`[PermissionOnboarding] ${id} request failed`, e);
      toast({
        title: "Couldn't open settings",
        description: "Please try again or open Android Settings manually.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
      // Small delay to let the OS settle, then re-check.
      setTimeout(refresh, 300);
    }
  };

  const visibleStates = states.filter(s => s.status !== "not_required");
  const allDone = !loading && !hasOutstandingPermissions(visibleStates);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-5 pt-8 pb-4">
        <h1 className="text-2xl font-bold">Enable Worker Permissions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          We need these to send you bookings reliably. Tap each one to enable.
        </p>
      </header>

      <main className="flex-1 px-5 space-y-3 overflow-y-auto pb-32">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && visibleStates.map((s) => (
          <PermissionRow
            key={s.id}
            state={s}
            busy={busyId === s.id}
            onRequest={() => handleRequest(s.id)}
          />
        ))}

        {!loading && visibleStates.length === 0 && (
          <Card className="p-6 text-center">
            <Check className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <p className="font-medium">All permissions are set</p>
          </Card>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 space-y-2">
        <Button
          className="w-full h-12 text-base"
          onClick={onComplete}
          disabled={loading}
        >
          {allDone ? "Continue" : "Continue anyway"}
        </Button>
        {!allDone && !loading && (
          <p className="text-xs text-center text-muted-foreground">
            Some features may not work properly until all permissions are enabled.
          </p>
        )}
      </footer>
    </div>
  );
}

function PermissionRow({
  state,
  busy,
  onRequest,
}: {
  state: PermissionState;
  busy: boolean;
  onRequest: () => void;
}) {
  const meta = META[state.id];
  const { Icon } = meta;

  const statusUI = (() => {
    switch (state.status) {
      case "granted":
        return { label: "Granted", className: "text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400", icon: <Check className="w-3.5 h-3.5" /> };
      case "denied":
        return { label: "Denied", className: "text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400", icon: <X className="w-3.5 h-3.5" /> };
      case "missing":
        return { label: "Missing", className: "text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400", icon: <AlertTriangle className="w-3.5 h-3.5" /> };
      default:
        return { label: "Tap to check", className: "text-muted-foreground bg-muted", icon: null };
    }
  })();

  const buttonLabel =
    state.status === "granted" ? "Enabled"
    : state.status === "denied" ? "Open Settings"
    : busy ? "Opening..."
    : "Enable";

  return (
    <Card className={cn(
      "p-4 transition-colors",
      state.status === "granted" && "border-green-200 dark:border-green-900"
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          "shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
          state.status === "granted" ? "bg-green-100 dark:bg-green-900/30" : "bg-primary/10"
        )}>
          <Icon className={cn(
            "w-5 h-5",
            state.status === "granted" ? "text-green-600" : "text-primary"
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{meta.title}</h3>
            <span className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
              statusUI.className
            )}>
              {statusUI.icon}
              {statusUI.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{meta.reason}</p>
          {state.canRequest && state.status !== "granted" && (
            <Button
              size="sm"
              variant={state.status === "denied" ? "outline" : "default"}
              className="mt-3 h-8"
              onClick={onRequest}
              disabled={busy}
            >
              {busy && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
              {buttonLabel}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
