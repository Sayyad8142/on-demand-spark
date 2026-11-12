import { displayText, useWorkerLanguage, serviceLabel, bookingStatusLabel, displayLocale } from "@/i18n/display";
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
  openNotificationSettings,
  checkBookingChannel,
  openBookingChannelSettings,
  requestActivity,
} from "@/lib/permissions";
import type { ChannelHealth } from "@/lib/setupGate";
import { notificationAction } from "@/lib/setupGate";

interface PermissionOnboardingProps {
  onComplete: () => void;
  /** Popups are optional: worker keeps booking notifications without the popup. */
  onContinueWithoutPopups?: () => void;
  onActivityHandled?: () => void;
}

type StepId = "notifications" | "overlay" | "activity";

const STEP_IDS: StepId[] = ["notifications", "overlay", "activity"];

const STEP_META: Record<
  StepId,
  { emoji: string; title: string; doneText: string }
> = {
  notifications: {
    emoji: "🔔",
    title: "Turn On Booking Alerts",
    doneText: "Booking Alerts Enabled",
  },
  activity: { emoji: "🚶", title: "Physical Activity Permission", doneText: "Physical Activity Enabled" },
  overlay: {
    emoji: "📱",
    title: "Show Booking Popups",
    doneText: "Booking Popups Enabled",
  },
};

export default function PermissionOnboarding({
  onComplete,
  onContinueWithoutPopups,
  onActivityHandled,
}: PermissionOnboardingProps) {
  useWorkerLanguage();
  const [states, setStates] = useState<PermissionState[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<StepId | null>(null);
  const [activityHandled, setActivityHandled] = useState(false);
  const [popupsSkipped, setPopupsSkipped] = useState(false);
  const [channel, setChannel] = useState<ChannelHealth>("unknown");

  const refresh = useCallback(async () => {
    const [next, ch] = await Promise.all([checkAllPermissions(), checkBookingChannel()]);
    setStates(next);
    setChannel(ch);
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
    const ok = status === "granted" || status === "not_required";
    if (id === "notifications") return ok && channel !== "blocked" && channel !== "app_disabled";
    return ok || (id === "activity" && activityHandled) || (id === "overlay" && popupsSkipped);
  };

  const grantedCount = STEP_IDS.filter(isGranted).length;
  const allDone = !loading && grantedCount === STEP_IDS.length;

  const handleEnable = useCallback(
    async (id: StepId) => {
      if (id === "overlay" && !Capacitor.isNativePlatform()) {
        return;
      }
      if (busyId) return; // ignore repeated taps
      setBusyId(id);
      try {
        if (id === "notifications") {
          // Android won't show the prompt again once blocked — go to Settings instead.
          if (channel === "blocked" && getStatus("notifications") === "granted") {
            await openBookingChannelSettings();
          } else if (notificationAction(getStatus("notifications")) === "open_settings") {
            await openNotificationSettings();
          } else {
            await requestNotificationPermission();
          }
        } else if (id === "activity") {
          const actual = await checkAllPermissions();
          const state = actual.find(s => s.id === "activity");
          if (state?.status !== "granted" && state?.status !== "not_required") await requestActivity();
          setActivityHandled(true);
          onActivityHandled?.();
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
    [refresh, busyId, states, channel, onActivityHandled]
  );

  const progressPct = (grantedCount / STEP_IDS.length) * 100;

  if (allDone) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
        <div className="text-7xl mb-6">🎉</div>
        <h1 className="text-4xl font-extrabold tracking-tight">
          {displayText("You're Ready")}
        </h1>
        <p className="text-lg text-muted-foreground mt-3">
          {displayText("You can now receive bookings.")}
        </p>
        <Button
          className="w-full max-w-sm min-h-16 h-auto py-4 text-lg font-bold hover:opacity-90 mt-10"
          onClick={() => { if (popupsSkipped) onContinueWithoutPopups?.(); else onComplete(); }}
        >
          {displayText("START RECEIVING BOOKINGS")}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-5 pt-10 pb-6 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">
          {displayText("Get Ready for Bookings")}
        </h1>
        <p className="text-base text-muted-foreground mt-2">
          {displayText("Booking permissions")}
        </p>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-muted-foreground">
              {displayText("Step")}{" "}
              {Math.min(
                grantedCount + 1,
                STEP_IDS.length
              )}{" "}
              {displayText("of")} {STEP_IDS.length}
            </span>
            <span className="text-sm font-semibold text-muted-foreground">
              {grantedCount}/{STEP_IDS.length}
            </span>
          </div>
          <div className="h-4 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{
                width: `${progressPct}%`,
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
              blocked={id === "notifications" && (getStatus(id) === "denied" || channel === "blocked")}
              onEnable={() => handleEnable(id)}
              onSkip={id === "overlay" && isGranted("notifications") ? () => setPopupsSkipped(true) : id === "activity" ? () => { setActivityHandled(true); onActivityHandled?.(); } : undefined}
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
  blocked,
  onEnable,
  onSkip,
}: {
  index: number;
  id: StepId;
  granted: boolean;
  busy: boolean;
  blocked: boolean;
  onEnable: () => void;
  onSkip?: () => void;
}) {
  useWorkerLanguage();
  const meta = STEP_META[id];
  return (
    <Card
      className={cn(
        "p-4 rounded-lg border-2 transition-all",
        granted
          ? "border-green-300 bg-green-50/40 dark:bg-green-950/10"
          : "border-border"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-2xl",
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
            {displayText("Step")} {index}
          </div>
          <h3 className="text-xl font-bold leading-tight mt-1">
            {displayText(meta.title)}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{displayText(id === "activity" ? "Helps verify you’ve started travelling after accepting a job. We never track your location. This is optional." : id === "overlay" ? "Show booking alerts over other apps. This is optional." : "Allow notifications so you get booking alerts instantly.")}</p>
          <div className="mt-2">
            {granted ? (
              <span className="inline-flex items-center gap-1.5 text-base font-semibold text-green-700">
                ✅ {displayText(meta.doneText)}
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 text-base font-semibold"
                
              >
                {displayText(id === "notifications" ? "⚠️ Required" : "Optional")}
              </span>
            )}
          </div>
        </div>
      </div>

      {!granted && (
        <div className="mt-5">
          {blocked && (
            <p className="text-base mb-3 text-muted-foreground">
              {displayText("Notifications are blocked. Tap Open Settings, turn on Notifications, then come back.")}
            </p>
          )}
          <Button
            className="w-full min-h-14 h-auto py-3 text-lg font-bold hover:opacity-90"
            onClick={onEnable}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              displayText(blocked ? "Open Settings" : "Enable")
            )}
          </Button>
          {onSkip && (
            <Button variant="outline" className="w-full min-h-12 h-auto py-3 mt-3 whitespace-normal text-base font-semibold" onClick={onSkip} disabled={busy}>
              {displayText(id === "activity" ? "Continue without movement access" : "Continue with notifications")}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
