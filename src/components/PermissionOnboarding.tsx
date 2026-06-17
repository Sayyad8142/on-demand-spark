import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  type PermissionId,
  type PermissionState,
  checkAllPermissions,
  requestOverlay,
  requestNotificationPermission,
} from "@/lib/permissions";

interface PermissionOnboardingProps {
  onComplete: () => void;
}

type StepId = "notifications" | "overlay";

const STEP_IDS: StepId[] = ["notifications", "overlay"];

const STEP_META: Record<
  StepId,
  { emoji: string; title: string; doneText: string }
> = {
  notifications: {
    emoji: "🔔",
    title: "Turn On Booking Alerts",
    doneText: "Booking Alerts Enabled",
  },
  overlay: {
    emoji: "📱",
    title: "Show Booking Popups",
    doneText: "Booking Popups Enabled",
  },
};

export default function PermissionOnboarding({
  onComplete,
}: PermissionOnboardingProps) {
  const [states, setStates] = useState<PermissionState[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<StepId | null>(null);

  const refresh = useCallback(async () => {
    const next = await checkAllPermissions();
    setStates(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      const onVis = () => {
        if (document.visibilityState === "visible") refresh();
      };
      document.addEventListener("visibilitychange", onVis);
      return () => document.removeEventListener("visibilitychange", onVis);
    }
    const sub = CapApp.addListener("appStateChange", (s) => {
      if (s.isActive) refresh();
    });
    return () => {
      sub.then((s) => s.remove());
    };
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

  const handleEnable = useCallback(
    async (id: StepId) => {
      if (id === "overlay" && !Capacitor.isNativePlatform()) {
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
      } finally {
        setBusyId(null);
        setTimeout(refresh, 800);
      }
    },
    [refresh]
  );

  const progressPct = (grantedCount / STEP_IDS.length) * 100;

  if (allDone) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
        <div className="text-7xl mb-6">🎉</div>
        <h1 className="text-4xl font-extrabold tracking-tight">
          You're Ready
        </h1>
        <p className="text-lg text-muted-foreground mt-3">
          You can now receive bookings.
        </p>
        <Button
          className="w-full max-w-sm h-16 text-lg font-bold text-white hover:opacity-90 mt-10"
          style={{ backgroundColor: "#ff007a" }}
          onClick={onComplete}
        >
          START RECEIVING BOOKINGS
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-5 pt-10 pb-6 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">
          Get Ready for Bookings
        </h1>
        <p className="text-base text-muted-foreground mt-2">
          2 Steps Required
        </p>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-muted-foreground">
              Step{" "}
              {Math.min(
                grantedCount + 1,
                STEP_IDS.length
              )}{" "}
              of {STEP_IDS.length}
            </span>
            <span className="text-sm font-semibold text-muted-foreground">
              {grantedCount}/{STEP_IDS.length}
            </span>
          </div>
          <div className="h-4 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPct}%`,
                backgroundColor: "#ff007a",
              }}
            />
          </div>
        </div>
      </header>

      <main className="flex-1 px-5 space-y-5 overflow-y-auto pb-36">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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
            />
          ))
        )}
      </main>
    </div>
  );
}

function StepCard({
  index,
  id,
  granted,
  busy,
  onEnable,
}: {
  index: number;
  id: StepId;
  granted: boolean;
  busy: boolean;
  onEnable: () => void;
}) {
  const meta = STEP_META[id];
  return (
    <Card
      className={cn(
        "p-6 rounded-2xl border-2 transition-all",
        granted
          ? "border-green-300 bg-green-50/40 dark:bg-green-950/10"
          : "border-gray-200"
      )}
    >
      <div className="flex items-center gap-5">
        <div
          className={cn(
            "shrink-0 w-20 h-20 rounded-2xl flex items-center justify-center text-4xl",
            granted ? "bg-green-100" : "bg-pink-50"
          )}
        >
          {granted ? (
            <Check className="w-10 h-10 text-green-600" />
          ) : (
            <span>{meta.emoji}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Step {index}
          </div>
          <h3 className="text-xl font-bold leading-tight mt-1">
            {meta.title}
          </h3>
          <div className="mt-2">
            {granted ? (
              <span className="inline-flex items-center gap-1.5 text-base font-semibold text-green-700">
                ✅ {meta.doneText}
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 text-base font-semibold"
                style={{ color: "#ff007a" }}
              >
                ⚠️ Required
              </span>
            )}
          </div>
        </div>
      </div>

      {!granted && (
        <div className="mt-5">
          <Button
            className="w-full h-14 text-lg font-bold text-white hover:opacity-90"
            style={{ backgroundColor: "#ff007a" }}
            onClick={onEnable}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Enable"
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}
