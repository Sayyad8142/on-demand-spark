import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useGuestSession } from "@/contexts/GuestSessionContext";
import { supabase } from "@/integrations/supabase/client";
import { startForegroundService, stopForegroundService } from "@/lib/foregroundService";
import { Capacitor } from '@capacitor/core';

interface AvailabilityToggleProps {
  workerId: string;
  className?: string;
}

export function AvailabilityToggle({ workerId, className }: AvailabilityToggleProps) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { isGuest } = useGuestSession();

  useEffect(() => {
    if (isGuest) {
      // In guest mode, default to available
      setIsAvailable(true);
      return;
    }
    loadAvailability();
  }, [workerId, isGuest]);

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
    }
  };

  const handleToggle = async (checked: boolean) => {
    if (isGuest) {
      // In guest mode, just update local state and show toast
      setIsAvailable(checked);
      toast({
        title: "Demo Mode",
        description: checked ? "Simulated: Now Available for Bookings" : "Simulated: Now Unavailable"
      });
      return;
    }

    setLoading(true);
    try {
      if (checked && Capacitor.isNativePlatform()) {
        await startForegroundService();
      }

      const { error } = await supabase.rpc("update_worker_availability", {
        p_is_available: checked
      });

      if (error) throw error;
      setIsAvailable(checked);

      if (!checked && Capacitor.isNativePlatform()) {
        await stopForegroundService();
      }

      toast({
        title: checked ? "Now Available" : "Now Unavailable",
        description: checked ? "You will receive booking alerts" : "You will not receive booking alerts"
      });
    } catch (error: any) {
      console.error("Error updating availability:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update availability",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  return <div className={`border rounded-lg p-4 shadow-sm transition-colors ${isAvailable ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"} ${className || ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Label htmlFor="availability" className="text-base font-semibold text-foreground cursor-pointer">
              {isAvailable ? "Available for Bookings" : "Currently Unavailable"}
            </Label>
            {isAvailable && <span className="inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
          </div>
          
        </div>
        <Switch id="availability" checked={isAvailable} onCheckedChange={handleToggle} disabled={loading} />
      </div>
    </div>;
}