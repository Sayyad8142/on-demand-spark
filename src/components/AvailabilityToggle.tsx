import { canTurnOn } from "@/lib/availabilityGate";
import { ToastAction } from "@/components/ui/toast";
import { buildAvailabilityRequest } from "@/lib/availabilityRequest";
import { displayText, useWorkerLanguage, serviceLabel, bookingStatusLabel, displayLocale } from "@/i18n/display";
import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Loader2, Volume2, VolumeX } from "lucide-react";
import { useAvailabilityGuide } from "@/hooks/useAvailabilityGuide";
import { AVAILABILITY_VIEW_TEXT, HOME_AVAILABILITY_GUIDE, availabilityView } from "@/lib/homeSummary";

interface AvailabilityToggleProps {
  workerId: string;
  className?: string;
  payoutReady?: boolean;
  onPayoutRequired?: () => void;
  pushHealthy?: boolean;
  onPushUnhealthy?: () => void;
  onboardingComplete?: boolean;
  onOnboardingIncomplete?: () => void;
  hasAvailabilitySlots?: boolean;
  onNoSlots?: () => void;
  /** Extra display-only gates (e.g. payout) that stop offers even when ON. */
  bookingReady?: boolean;
}

const REFRESH_INTERVAL_MS = 2 * 60 * 1000; // heartbeat cadence

export function AvailabilityToggle({
  workerId,
  className,
  payoutReady = true,
  onPayoutRequired,
  pushHealthy = true,
  onPushUnhealthy,
  onboardingComplete = true,
  onOnboardingIncomplete,
  hasAvailabilitySlots = true,
  onNoSlots,
  bookingReady = true,
}: AvailabilityToggleProps) {
  useWorkerLanguage();
  const [isAvailable, setIsAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pressed, setPressed] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const { toast } = useToast();
  const { t } = useTranslation();
  const guide = useAvailabilityGuide({
    texts: HOME_AVAILABILITY_GUIDE,
    onResult: (r) => {
      if (r === "fallback_english") toast({ title: t("availability.voiceEnglishOnly") });
      if (r === "unavailable") toast({ title: t("availability.voiceUnavailable") });
    },
  });

  const loadAvailability = async (opts: { silent?: boolean } = {}) => {
    try {
      const { data, error } = await supabase
        .from("workers")
        .select("is_available")
        .eq("id", workerId)
        .single();
      if (error) throw error;
      setIsAvailable((prev) => {
        const next = data?.is_available || false;
        // Notify worker if backend flipped ON automatically (e.g. after 48h auto-enable).
        if (opts.silent && !prev && next) {
          toast({
            title: t("home.nowAvailable"),
            description: t("home.willReceiveAlerts"),
          });
        }
        return next;
      });
    } catch (error) {
      if (!opts.silent) console.error("Error loading availability:", error);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    if (!workerId) return;
    loadAvailability();
  }, [workerId]);

  // Keep availability in sync with backend (handles 48h auto-enable, cross-device changes).
  useEffect(() => {
    if (!workerId) return;
    const refresh = () => loadAvailability({ silent: true });

    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    let nativeSub: any;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) refresh();
      }).then((sub) => { nativeSub = sub; });
    }

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      if (nativeSub) nativeSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);


  const handleToggle = async () => {
    if (loading) return;
    const newValue = !isAvailable;

    // HARD BLOCK: cannot go online without valid saved slots. Re-read the
    // worker's saved slots from the backend at tap time (never trust a cached prop).
    if (newValue) {
      let slotsOk = hasAvailabilitySlots;
      const { data: slotRows, error: slotErr } = await supabase
        .from("worker_availability")
        .select("slots")
        .eq("worker_id", workerId);
      if (!slotErr) slotsOk = canTurnOn(true, slotRows as any);
      if (!slotsOk) {
        setIsAvailable(false);
        toast({
          title: displayText("Select slot to start bookings"),
          description: displayText("Please select your available time slots before going online."),
          variant: "destructive",
          action: (
            <ToastAction altText={displayText("Set Availability")} onClick={() => onNoSlots?.()}>
              {displayText("Set Availability")}
            </ToastAction>
          ),
        });
        return;
      }
    }

    // HARD BLOCK: no internet — bookings can't be delivered.
    if (newValue && !networkOnline) {
      toast({
        title: displayText("No internet connection"),
        description: displayText("Reconnect to Wi-Fi or mobile data to go online."),
        variant: "destructive",
      });
      return;
    }

    // HARD BLOCK: FCM/notifications not healthy — worker would silently miss bookings.
    // Trigger repair automatically and prompt the parent to guide the worker.
    if (newValue && !pushHealthy) {
      toast({
        title: displayText("Booking alerts not ready"),
        description: displayText("Fixing notifications in the background. You'll be able to go online once it's ready."),
        variant: "destructive",
      });
      onPushUnhealthy?.();
      return;
    }

    // Soft warning: onboarding incomplete (allow going online)
    if (newValue && !onboardingComplete) {
      toast({
        title: displayText("Setup incomplete"),
        description: displayText("Complete your profile setup to receive more bookings."),
      });
      onOnboardingIncomplete?.();
    }

    // Soft warning: payout not ready (allow going online)
    if (newValue && !payoutReady) {
      toast({
        title: displayText("Payout setup pending"),
        description: displayText("You can receive bookings, but complete payout setup to get paid."),
      });
    }

    setPressed(true);
    setTimeout(() => setPressed(false), 200);
    setLoading(true);

    // Optimistic UI — flip instantly so the worker sees OFF/ON immediately.
    const prevValue = isAvailable;
    setIsAvailable(newValue);

    try {
      // Secure path: call the authenticated Edge Function
      const { data, error } = await supabase.functions.invoke("update-availability", {
        body: buildAvailabilityRequest(newValue, "toggle_tap"),
      });
      
      if (error) throw error;
      if (!data.ok) throw new Error(data.error || "Failed to update availability");
      
      toast({
        title: newValue ? t("home.nowAvailable") : t("home.nowUnavailable"),
        description: newValue
          ? t("home.willReceiveAlerts")
          : displayText("You won't receive new booking requests while unavailable."),
      });
    } catch (error: any) {
      console.error("Error updating availability:", error);
      // Roll back optimistic flip if backend update failed.
      setIsAvailable(prevValue);
      toast({
        title: displayText("Error"),
        description: displayText("Could not change. Please try again."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };


  if (initialLoading) {
    return (
      <div className={`rounded-xl p-4 bg-muted animate-pulse ${className || ""}`} style={{ height: 62 }} />
    );
  }

  const view = availabilityView({
    isAvailable,
    payoutReady: bookingReady,
    pushHealthy,
    hasSlots: hasAvailabilitySlots,
  });
  const text = AVAILABILITY_VIEW_TEXT[view];
  const bg = view === "ready" ? "#166534" : view === "off" ? "#b91c1c" : "#b45309";

  return (
    <div
      className={`rounded-xl px-4 py-3 transition-colors duration-300 ${className || ""}`}
      style={{ backgroundColor: bg }}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Label className="text-lg font-bold leading-tight cursor-pointer select-none text-white">
              {displayText(text.heading)}
            </Label>
            <button
              type="button"
              onClick={guide.toggle}
              aria-label={guide.state === "idle" ? displayText("Listen to help") : displayText("Stop voice")}
              className="shrink-0 rounded-full p-1.5 text-white/90 hover:bg-white/15"
            >
              {guide.state === "idle" ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-sm text-white/90 leading-snug">
            {loading ? displayText("Saving...") : displayText(text.description)}
          </p>
        </div>

        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={isAvailable}
            aria-busy={loading}
            disabled={loading}
            onClick={handleToggle}
            className="relative inline-flex items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait"
            style={{
              width: 60,
              height: 32,
              backgroundColor: isAvailable ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)",
              transform: pressed ? "scale(0.95)" : "scale(1)",
              transition: "background-color 300ms ease-in-out, transform 200ms ease-in-out",
            }}
          >
            <span
              className="flex items-center justify-center rounded-full bg-white shadow-lg"
              style={{
                width: 26,
                height: 26,
                transform: isAvailable ? "translateX(31px)" : "translateX(3px)",
                transition: "transform 300ms ease-in-out",
              }}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" style={{ color: bg }} />}
            </span>
          </button>
          <span className="text-xs font-bold text-white">{isAvailable ? displayText("ON") : displayText("OFF")}</span>
        </div>
      </div>
    </div>
  );
}
