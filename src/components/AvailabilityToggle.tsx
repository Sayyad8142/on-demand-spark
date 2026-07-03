import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";

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
}

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
}: AvailabilityToggleProps) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [pressed, setPressed] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    loadAvailability();
  }, [workerId]);

  // Track network status live so the hard-block reflects reality.
  useEffect(() => {
    const on = () => setNetworkOnline(true);
    const off = () => setNetworkOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const loadAvailability = async () => {
    try {
      const { data, error } = await supabase
        .from("workers")
        .select("is_available")
        .eq("id", workerId)
        .single();
      if (error) throw error;
      setIsAvailable(data?.is_available || false);
    } catch (error) {
      console.error("Error loading availability:", error);
    } finally {
      setInitialLoading(false);
    }
  };

  const handleToggle = async () => {
    if (loading) return;
    const newValue = !isAvailable;

    // HARD BLOCK: cannot go online without any availability slots selected
    if (newValue && !hasAvailabilitySlots) {
      toast({
        title: "Select slot to start bookings",
        description: "Please select at least one time slot in Availability.",
        variant: "destructive",
      });
      onNoSlots?.();
      return;
    }

    // HARD BLOCK: no internet — bookings can't be delivered.
    if (newValue && !networkOnline) {
      toast({
        title: "No internet connection",
        description: "Reconnect to Wi-Fi or mobile data to go online.",
        variant: "destructive",
      });
      return;
    }

    // HARD BLOCK: FCM/notifications not healthy — worker would silently miss bookings.
    // Trigger repair automatically and prompt the parent to guide the worker.
    if (newValue && !pushHealthy) {
      toast({
        title: "Booking alerts not ready",
        description: "Fixing notifications in the background. You'll be able to go online once it's ready.",
        variant: "destructive",
      });
      onPushUnhealthy?.();
      return;
    }

    // Soft warning: onboarding incomplete (allow going online)
    if (newValue && !onboardingComplete) {
      toast({
        title: "Setup incomplete",
        description: "Complete your profile setup to receive more bookings.",
      });
      onOnboardingIncomplete?.();
    }

    // Soft warning: payout not ready (allow going online)
    if (newValue && !payoutReady) {
      toast({
        title: "Payout setup pending",
        description: "You can receive bookings, but complete payout setup to get paid.",
      });
    }

    setPressed(true);
    setTimeout(() => setPressed(false), 200);
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("update_worker_availability", {
        worker_id_param: workerId,
        is_available_param: newValue,
      });
      if (error) throw error;
      if (data === false) throw new Error("Worker not found");
      setIsAvailable(newValue);
      toast({
        title: newValue ? t("home.nowAvailable") : t("home.nowUnavailable"),
        description: newValue
          ? t("home.willReceiveAlerts")
          : t("home.willNotReceiveAlerts"),
      });
    } catch (error: any) {
      console.error("Error updating availability:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update availability",
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

  return (
    <div
      className={`rounded-xl p-4 transition-all duration-300 ease-in-out ${className || ""}`}
      style={{
        backgroundColor: isAvailable ? "#166534" : "#b91c1c",
        boxShadow: isAvailable
          ? "0 0 20px 4px rgba(22,101,52,0.3)"
          : "0 0 20px 4px rgba(185,28,28,0.3)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-base font-bold cursor-pointer select-none text-white">
            {isAvailable ? t("home.availableForBookings") : t("home.currentlyUnavailable")}
          </Label>
          <span
            className="inline-block h-2.5 w-2.5 rounded-full bg-white"
            style={{
              boxShadow: "0 0 6px 2px rgba(255,255,255,0.5)",
              animation: isAvailable ? "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" : "none",
            }}
          />
        </div>

        {/* Custom toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={isAvailable}
          disabled={loading}
          onClick={handleToggle}
          className="relative inline-flex items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            width: 56,
            height: 30,
            backgroundColor: isAvailable ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)",
            transform: pressed ? "scale(0.95)" : "scale(1.1)",
            transition: "background-color 300ms ease-in-out, transform 200ms ease-in-out",
          }}
        >
          <span
            className="block rounded-full bg-white shadow-lg"
            style={{
              width: 24,
              height: 24,
              transform: isAvailable ? "translateX(28px)" : "translateX(3px)",
              transition: "transform 300ms ease-in-out",
            }}
          />
        </button>
      </div>
    </div>
  );
}
