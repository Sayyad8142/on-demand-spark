import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Layers, BatteryCharging, Check, X, AlertTriangle, Loader2, HelpCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  type PermissionId,
  type PermissionState,
  type PermissionDebugEvent,
  checkAllPermissions,
  hasOutstandingPermissions,
  requestOverlay,
  requestBatteryExemption,
  requestActivity,
  setPermissionDebugReporter,
  ActivityPermissionManualFallbackError,
} from "@/lib/permissions";
import {
  type OemInfo,
  type PermissionKind,
  getOemInfo,
  getOemHint,
  isTrickyOem,
  getOemDisplayName,
} from "@/lib/oemHints";

interface PermissionMeta {
  title: string;
  reason: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const META: Record<PermissionId, PermissionMeta> = {
  notifications: {
    title: "Notifications",
    reason: "So you receive booking alerts the moment they arrive.",
    Icon: Layers,
  },
  overlay: {
    title: "Display over other apps / Overlay",
    reason: "Shows new bookings as a popup even when the app is in background.",
    Icon: Layers,
  },
  battery: {
    title: "Battery optimization",
    reason: "Keeps booking alerts working reliably when your phone is idle.",
    Icon: BatteryCharging,
  },
  activity: {
    title: "Physical activity / Step count",
    reason: "Helps verify you've started moving after accepting a booking.",
    Icon: Layers,
  },
};

const PERMISSION_KIND: Record<PermissionId, PermissionKind> = {
  notifications: "notifications",
  overlay: "overlay",
  battery: "battery",
  activity: "activity",
};

const ONBOARDING_PERMISSION_IDS: PermissionId[] = ["overlay", "activity"];

interface PermissionOnboardingProps {
  onComplete: () => void;
}

interface FallbackModalState {
  open: boolean;
  permissionId: PermissionId | null;
}

export default function PermissionOnboarding({ onComplete }: PermissionOnboardingProps) {
  const [states, setStates] = useState<PermissionState[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<PermissionId | null>(null);
  const [failedIds, setFailedIds] = useState<Set<PermissionId>>(new Set());
  const [oem, setOem] = useState<OemInfo | null>(null);
  const [fallbackModal, setFallbackModal] = useState<FallbackModalState>({ open: false, permissionId: null });
  const [activityRationaleOpen, setActivityRationaleOpen] = useState(false);
  const [activityManualOpen, setActivityManualOpen] = useState(false);
  const [debugEvents, setDebugEvents] = useState<PermissionDebugEvent[]>([]);

  const addDebugEvent = useCallback((event: Omit<PermissionDebugEvent, "at">) => {
    setDebugEvents((prev) => [{ ...event, at: new Date().toLocaleTimeString() }, ...prev].slice(0, 8));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await checkAllPermissions();
    next.forEach((state) => {
      console.log(`[PermissionOnboarding] status ${state.id}=${state.status} canRequest=${state.canRequest}`);
      addDebugEvent({ permissionId: state.id, step: "status", status: state.status === "granted" || state.status === "not_required" ? "success" : "failed", message: `Current status: ${state.status}` });
    });
    setStates(next);
    setLoading(false);
  }, [addDebugEvent]);

  useEffect(() => {
    refresh();
    getOemInfo().then(setOem).catch(() => setOem(null));
  }, [refresh]);

  useEffect(() => {
    setPermissionDebugReporter((event) => {
      setDebugEvents((prev) => [event, ...prev].slice(0, 8));
    });
    return () => setPermissionDebugReporter(null);
  }, []);

  // Re-check when user returns from system Settings
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      const onVis = () => { if (document.visibilityState === "visible") refresh(); };
      document.addEventListener("visibilitychange", onVis);
      return () => document.removeEventListener("visibilitychange", onVis);
    }
    const sub = CapApp.addListener("appStateChange", (s) => {
      if (s.isActive) {
        console.log("[PermissionOnboarding] App resumed — re-running checkAllPermissions()");
        refresh();
      }
    });
    return () => { sub.then(s => s.remove()); };
  }, [refresh]);

  const markFailed = (id: PermissionId, failed: boolean) => {
    setFailedIds(prev => {
      const next = new Set(prev);
      if (failed) next.add(id); else next.delete(id);
      return next;
    });
  };

  const openFallbackModal = useCallback((id: PermissionId) => {
    setFallbackModal({ open: true, permissionId: id });
  }, []);

  const handleRequest = useCallback(async (id: PermissionId, options?: { silent?: boolean }) => {
    console.log(`[PermissionOnboarding] 👆 Enable tapped — id=${id}, native=${Capacitor.isNativePlatform()}, oem=${oem?.id}`);
    addDebugEvent({ permissionId: id, step: "button", status: "started", message: `Enable tapped; native=${Capacitor.isNativePlatform()} platform=${Capacitor.getPlatform()}` });
    if (id !== "notifications" && !Capacitor.isNativePlatform()) {
      toast({
        title: "Available on Android only",
        description: "This permission can only be enabled on the installed Android app.",
      });
      return;
    }
    // Show a clear, pink-themed rationale before the system activity prompt.
    // Skip rationale entirely if the permission is already granted — the
    // worker should never see a dialog in that case.
    if (id === "activity" && !options?.silent) {
      const current = states.find((s) => s.id === "activity");
      if (current?.status === "granted") {
        console.log("[ActivityPermission] already_granted — skipping rationale");
        addDebugEvent({ permissionId: "activity", step: "rationale", status: "success", message: "Already granted — skipped" });
        return;
      }
      if (activityRationaleOpen) {
        // Guard against double-tap opening duplicate dialogs
        return;
      }
      console.log("[ActivityPermission] rationale_opened");
      addDebugEvent({ permissionId: "activity", step: "rationale", status: "started", message: "rationale_opened" });
      setActivityRationaleOpen(true);
      return;
    }
    setBusyId(id);
    markFailed(id, false);
    try {
      switch (id) {
        case "overlay":
          await requestOverlay();
          break;
        case "battery":
          await requestBatteryExemption();
          break;
        case "activity":
          console.log("[ActivityPermission] permission_requested");
          {
            const result = await requestActivity();
            if (result) {
              console.log("[ActivityPermission] permission_granted");
            } else {
              console.log("[ActivityPermission] permission_denied");
            }
          }
          break;
        default:
          return;
      }
      console.log(`[PermissionOnboarding] ✅ ${id} request returned without throwing`);
      addDebugEvent({ permissionId: id, step: "handleRequest", status: "success", message: id === "activity" ? "Permission prompt/settings opened" : "Request completed without throwing" });
    } catch (e) {
      console.error(`[PermissionOnboarding] ${id} request failed`, e);
      addDebugEvent({ permissionId: id, step: "handleRequest", status: "failed", error: e instanceof Error ? e.message : String(e) });
      markFailed(id, true);

      // Activity-specific manual fallback: ALWAYS show a clear dialog with
      // explicit title + message + OK so the user never sees a blank popup.
      if (id === "activity" && e instanceof ActivityPermissionManualFallbackError) {
        console.log("[ActivityPermission] manual_instructions_shown");
        addDebugEvent({ permissionId: "activity", step: "handleRequest", status: "fallback", message: "manual_instructions_shown" });
        setActivityManualOpen(true);
      } else if (id === "overlay" || id === "battery" || id === "activity") {
        openFallbackModal(id);
        if (!options?.silent) {
          toast({
            title: "Open manually",
            description: "Use the step-by-step instructions for this permission.",
          });
        }
      } else {
        toast({
          title: "Couldn't open settings",
          description: "Tap Retry, or use 'Show me how' for manual steps.",
          variant: "destructive",
        });
      }
    } finally {
      setBusyId(null);
      setTimeout(refresh, 900);
    }
  }, [addDebugEvent, oem?.id, openFallbackModal, refresh]);

  const visibleStates = states.filter(s => ONBOARDING_PERMISSION_IDS.includes(s.id) && s.status !== "not_required");
  const allDone = !loading && !hasOutstandingPermissions(visibleStates);
  const showOemBanner = oem && isTrickyOem(oem.id) && !allDone && !loading;

  useEffect(() => {
    if (allDone) {
      onComplete();
    }
  }, [allDone, onComplete]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-5 pt-8 pb-4">
        <h1 className="text-2xl font-bold">Enable Worker Permissions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tap each required permission to enable it and keep booking alerts working properly.
        </p>
      </header>

      <main className="flex-1 px-5 space-y-3 overflow-y-auto pb-32">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {showOemBanner && (
          <Card className="p-3 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 dark:text-amber-200">
                <span className="font-semibold">{getOemDisplayName(oem!.id)} detected.</span>{" "}
                Some toggles may be in a non-standard place. If a button doesn't work,
                tap <span className="font-semibold">Show me how</span> for step-by-step instructions.
              </div>
            </div>
          </Card>
        )}

        {!loading && visibleStates.map((s) => (
          <PermissionRow
            key={s.id}
            state={s}
            busy={busyId === s.id}
            failed={failedIds.has(s.id)}
            oem={oem}
            onRequest={() => handleRequest(s.id)}
            onShowHelp={() => openFallbackModal(s.id)}
          />
        ))}

        {!loading && (
          <PermissionDebugPanel events={debugEvents} />
        )}

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
          disabled={loading || !allDone}
        >
          Continue to app
        </Button>
        {!allDone && !loading && (
          <p className="text-xs text-center text-muted-foreground">
            Some features may not work properly until all permissions are enabled.
          </p>
        )}
      </footer>

      <FallbackInstructionsModal
        open={fallbackModal.open}
        permissionId={fallbackModal.permissionId}
        oem={oem}
        onClose={() => setFallbackModal({ open: false, permissionId: null })}
      />

      <Dialog open={activityRationaleOpen} onOpenChange={(o) => !o && setActivityRationaleOpen(false)}>
        <DialogContent className="max-w-sm rounded-2xl bg-white border border-gray-200">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: '#ffe6f2' }}>
              <Layers className="h-6 w-6" style={{ color: '#ff007a' }} />
            </div>
            <DialogTitle className="text-center text-base text-gray-900">
              Physical Activity Permission Required
            </DialogTitle>
            <DialogDescription className="text-center text-sm text-gray-700">
              Didi Now uses your phone's activity sensor to verify that you have started travelling after accepting a booking.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg p-3 text-xs space-y-2" style={{ backgroundColor: '#fff5f9' }}>
            <p className="font-semibold text-gray-900">Benefits</p>
            <ul className="space-y-1.5 text-gray-700">
              <li className="flex gap-2">
                <span style={{ color: '#ff007a' }}>•</span>
                <span>Helps confirm worker movement after accepting jobs</span>
              </li>
              <li className="flex gap-2">
                <span style={{ color: '#ff007a' }}>•</span>
                <span>Improves booking reliability</span>
              </li>
              <li className="flex gap-2">
                <span style={{ color: '#ff007a' }}>•</span>
                <span>Prevents false acceptance of bookings</span>
              </li>
              <li className="flex gap-2">
                <span style={{ color: '#ff007a' }}>•</span>
                <span>Does not track your exact location</span>
              </li>
            </ul>
          </div>

          <p className="text-[11px] text-gray-500 text-center">
            This permission is required to continue.
          </p>

          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              className="w-full text-white hover:opacity-90"
              style={{ backgroundColor: '#ff007a' }}
              onClick={() => {
                setActivityRationaleOpen(false);
                handleRequest("activity", { silent: true });
              }}
            >
              Continue
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full border-gray-300 text-gray-700 hover:bg-gray-50"
              onClick={() => setActivityRationaleOpen(false)}
            >
              Not Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={activityManualOpen} onOpenChange={(o) => !o && setActivityManualOpen(false)}>
        <DialogContent className="max-w-sm rounded-2xl bg-white border border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-base text-gray-900">
              Physical Activity Permission Needed
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-700">
              This permission is required to continue.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg p-3 text-xs text-gray-700" style={{ backgroundColor: '#f9fafb' }}>
            We couldn't open the settings screen automatically. Please open
            <span className="font-semibold text-gray-900"> Android Settings › Apps › Didi Now › Permissions </span>
            and allow <span className="font-semibold text-gray-900">Physical activity</span>.
          </div>
          <DialogFooter className="sm:justify-end">
            <Button
              className="w-full sm:w-auto text-white hover:opacity-90"
              style={{ backgroundColor: '#ff007a' }}
              onClick={() => setActivityManualOpen(false)}
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PermissionDebugPanel({ events }: { events: PermissionDebugEvent[] }) {
  return (
    <Card className="p-3 border-dashed">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Permission status debug</h2>
        <span className="text-[10px] text-muted-foreground">Last {events.length}</span>
      </div>
      {events.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No permission attempts recorded yet.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {events.map((event, index) => (
            <div key={`${event.at}-${event.permissionId}-${event.step}-${index}`} className="rounded-md bg-muted/50 p-2 text-xs">
              <div className="flex flex-wrap items-center gap-1 font-medium">
                <span>{event.permissionId}</span>
                <span className="text-muted-foreground">/</span>
                <span>{event.step}</span>
                <span className={cn(
                  "ml-auto rounded-full px-1.5 py-0.5 text-[10px]",
                  event.status === "success" && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                  event.status === "failed" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                  event.status === "fallback" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                  event.status === "started" && "bg-primary/10 text-primary"
                )}>{event.status}</span>
              </div>
              {event.fallbackPath && <p className="mt-1 text-muted-foreground">Fallback: {event.fallbackPath}</p>}
              {event.message && <p className="mt-1 text-muted-foreground">{event.message}</p>}
              {event.error && <p className="mt-1 text-red-600 dark:text-red-400 break-words">Error: {event.error}</p>}
              <p className="mt-1 text-[10px] text-muted-foreground">{event.at}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function PermissionRow({
  state,
  busy,
  failed,
  oem,
  onRequest,
  onShowHelp,
}: {
  state: PermissionState;
  busy: boolean;
  failed: boolean;
  oem: OemInfo | null;
  onRequest: () => void;
  onShowHelp: () => void;
}) {
  const meta = META[state.id];
  const { Icon } = meta;
  const kind = PERMISSION_KIND[state.id];
  const hasHint = !!(oem && getOemHint(oem.id, kind));

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

  const primaryLabel =
    state.status === "granted" ? "Enabled"
    : failed ? "Retry"
    : state.status === "denied" ? "Open Settings"
    : busy ? "Opening..."
    : "Enable";

  const PrimaryIcon = failed ? RotateCcw : null;

  return (
    <Card className={cn(
      "p-4 transition-colors",
      state.status === "granted" && "border-green-200 dark:border-green-900",
      failed && "border-red-200 dark:border-red-900"
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

          {failed && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              Settings didn't open. Try again, or use the manual steps.
            </p>
          )}

          {state.canRequest && state.status !== "granted" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={failed ? "default" : state.status === "denied" ? "outline" : "default"}
                className="h-8"
                onClick={onRequest}
                disabled={busy}
              >
                {busy && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
                {PrimaryIcon && <PrimaryIcon className="w-3 h-3 mr-1.5" />}
                {primaryLabel}
              </Button>
              {hasHint && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={onShowHelp}
                  disabled={busy}
                >
                  <HelpCircle className="w-3 h-3 mr-1" />
                  Show me how
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function FallbackInstructionsModal({
  open,
  permissionId,
  oem,
  onClose,
}: {
  open: boolean;
  permissionId: PermissionId | null;
  oem: OemInfo | null;
  onClose: () => void;
}) {
  if (!permissionId) return null;
  const kind = PERMISSION_KIND[permissionId];
  const hint = oem ? getOemHint(oem.id, kind) : null;
  const meta = META[permissionId];

  const handleCopy = () => {
    if (!hint) return;
    const text = `${meta.title} — ${hint.title}\n\n` + hint.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
    navigator.clipboard?.writeText(text).then(
      () => toast({ title: "Steps copied", description: "Paste into Notes or share with support." }),
      () => toast({ title: "Couldn't copy", description: "Long-press the steps to copy manually.", variant: "destructive" })
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Enable: {meta.title}</DialogTitle>
          {hint && (
            <DialogDescription className="text-xs">
              {hint.title}
            </DialogDescription>
          )}
        </DialogHeader>

        {hint ? (
          <ol className="space-y-2 text-sm">
            {hint.steps.map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="flex-1">{step}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            Open Android Settings → Apps → Didi Now Partner → Permissions, then enable the one you need.
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {hint && (
            <Button variant="outline" size="sm" onClick={handleCopy}>
              Copy steps
            </Button>
          )}
          <Button size="sm" onClick={onClose}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
