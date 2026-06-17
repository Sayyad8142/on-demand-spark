import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Bell, Layers, Check, Loader2, HelpCircle } from "lucide-react";
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
  checkAllPermissions,
  requestOverlay,
  requestNotificationPermission,
} from "@/lib/permissions";
import {
  type OemInfo,
  getOemInfo,
  getOemHint,
} from "@/lib/oemHints";

interface PermissionOnboardingProps {
  onComplete: () => void;
}

type StepId = "notifications" | "overlay";

const STEP_IDS: StepId[] = ["notifications", "overlay"];

const STEP_META: Record<StepId, { emoji: string; title: string; Icon: React.ComponentType<{ className?: string }> }> = {
  notifications: { emoji: "📢", title: "Allow Notifications", Icon: Bell },
  overlay: { emoji: "📱", title: "Show Booking Popups", Icon: Layers },
};

export default function PermissionOnboarding({ onComplete }: PermissionOnboardingProps) {
  const [states, setStates] = useState<PermissionState[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<StepId | null>(null);
  const [oem, setOem] = useState<OemInfo | null>(null);
  const [helpFor, setHelpFor] = useState<StepId | null>(null);

  const refresh = useCallback(async () => {
    const next = await checkAllPermissions();
    setStates(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    getOemInfo().then(setOem).catch(() => setOem(null));
  }, [refresh]);

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

  const getStatus = (id: StepId): PermissionState["status"] => {
    const s = states.find((x) => x.id === (id as PermissionId));
    return s?.status ?? "unknown";
  };

  const isGranted = (id: StepId) => {
    const status = getStatus(id);
    return status === "granted" || status === "not_required";
  };

  const grantedCount = STEP_IDS.filter(isGranted).length;
  const allDone = !loading && grantedCount === STEP_IDS.length;

  const handleEnable = useCallback(async (id: StepId) => {
    if (id === "overlay" && !Capacitor.isNativePlatform()) {
      toast({
        title: "Available on the Android app",
        description: "Open the installed app to enable this.",
      });
      return;
    }
    setBusyId(id);
    try {
      if (id === "notifications") {
        await requestNotificationPermission();
      } else {
        await requestOverlay();
      }
    } catch (e) {
      console.error(`[PermissionOnboarding] ${id} failed`, e);
      setHelpFor(id);
    } finally {
      setBusyId(null);
      setTimeout(refresh, 800);
    }
  }, [refresh]);

  useEffect(() => {
    if (allDone) onComplete();
  }, [allDone, onComplete]);

  const progressPct = (grantedCount / STEP_IDS.length) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-5 pt-10 pb-6">
        <h1 className="text-3xl font-bold tracking-tight">Enable Booking Alerts</h1>
        <p className="text-base text-muted-foreground mt-2">Complete these 2 steps</p>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">
              Step {Math.min(grantedCount + (allDone ? 0 : 1), STEP_IDS.length)} of {STEP_IDS.length}
            </span>
            <span className="text-xs font-medium text-muted-foreground">{grantedCount}/{STEP_IDS.length}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, backgroundColor: "#ff007a" }}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 space-y-4 overflow-y-auto pb-36">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          STEP_IDS.map((id, idx) => (
            <StepCard
              key={id}
              index={idx + 1}
              id={id}
              granted={isGranted(id)}
              busy={busyId === id}
              onEnable={() => handleEnable(id)}
              onHelp={() => setHelpFor(id)}
            />
          ))
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-background border-t p-4">
        <Button
          className="w-full h-14 text-base font-semibold text-white hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: "#ff007a" }}
          onClick={onComplete}
          disabled={loading || !allDone}
        >
          {allDone ? "Start Receiving Bookings" : `Enable ${STEP_IDS.length - grantedCount} more to continue`}
        </Button>
      </footer>

      <HelpModal
        open={!!helpFor}
        stepId={helpFor}
        oem={oem}
        onClose={() => setHelpFor(null)}
      />
    </div>
  );
}

function StepCard({
  index,
  id,
  granted,
  busy,
  onEnable,
  onHelp,
}: {
  index: number;
  id: StepId;
  granted: boolean;
  busy: boolean;
  onEnable: () => void;
  onHelp: () => void;
}) {
  const meta = STEP_META[id];
  return (
    <Card
      className={cn(
        "p-5 rounded-2xl border-2 transition-all",
        granted ? "border-green-300 bg-green-50/40 dark:bg-green-950/10" : "border-gray-200"
      )}
    >
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center text-3xl",
            granted ? "bg-green-100" : "bg-pink-50"
          )}
        >
          {granted ? <Check className="w-8 h-8 text-green-600" /> : <span>{meta.emoji}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Step {index}
          </div>
          <h3 className="text-lg font-bold leading-tight mt-0.5">{meta.title}</h3>
          <div className="mt-1">
            {granted ? (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-green-700">
                ✅ Done
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "#ff007a" }}>
                ⚠️ Required
              </span>
            )}
          </div>
        </div>
      </div>

      {!granted && (
        <div className="mt-4 flex items-center gap-2">
          <Button
            className="flex-1 h-12 text-base font-semibold text-white hover:opacity-90"
            style={{ backgroundColor: "#ff007a" }}
            onClick={onEnable}
            disabled={busy}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enable"}
          </Button>
          <Button
            variant="ghost"
            className="h-12 px-3 text-muted-foreground"
            onClick={onHelp}
            aria-label="Show me how"
          >
            <HelpCircle className="w-5 h-5" />
          </Button>
        </div>
      )}
    </Card>
  );
}

function HelpModal({
  open,
  stepId,
  oem,
  onClose,
}: {
  open: boolean;
  stepId: StepId | null;
  oem: OemInfo | null;
  onClose: () => void;
}) {
  if (!stepId) return null;
  const meta = STEP_META[stepId];
  const hint = oem ? getOemHint(oem.id, stepId === "notifications" ? "notifications" : "overlay") : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">How to enable: {meta.title}</DialogTitle>
          {hint && <DialogDescription className="text-xs">{hint.title}</DialogDescription>}
        </DialogHeader>
        {hint ? (
          <ol className="space-y-2 text-sm">
            {hint.steps.map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 w-6 h-6 rounded-full text-white text-xs font-semibold flex items-center justify-center" style={{ backgroundColor: "#ff007a" }}>
                  {i + 1}
                </span>
                <span className="flex-1">{step}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            Open Android Settings → Apps → Didi Now Partner → Permissions, then turn on the one you need.
          </p>
        )}
        <DialogFooter>
          <Button
            className="w-full text-white hover:opacity-90"
            style={{ backgroundColor: "#ff007a" }}
            onClick={onClose}
          >
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
