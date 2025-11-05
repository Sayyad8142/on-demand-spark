import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { startNativeLocationTracking, stopNativeLocationTracking, isNativeLocationTracking, requestBatteryOptimization } from "@/lib/nativeLocationTracking";
import { startForegroundService, stopForegroundService } from "@/lib/foregroundService";
import { Capacitor } from '@capacitor/core';

interface AvailabilityToggleProps {
  workerId: string;
}

export function AvailabilityToggle({ workerId }: AvailabilityToggleProps) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadAvailability();
  }, [workerId]);

  // Auto-start native location tracking if already available on mount
  useEffect(() => {
    const autoStartTracking = async () => {
      if (isAvailable && Capacitor.isNativePlatform()) {
        const isTracking = await isNativeLocationTracking();
        if (!isTracking) {
          console.log('📍 Worker is available, auto-starting native location tracking');
          await startNativeLocationTracking();
          await startForegroundService();
          await requestBatteryOptimization();
        }
      }
    };
    
    if (isAvailable) {
      autoStartTracking();
    }
  }, [isAvailable]);

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
    setLoading(true);
    try {
      if (checked && Capacitor.isNativePlatform()) {
        // Request battery optimization exemption
        await requestBatteryOptimization();
        
        // Start native location tracking (includes WorkManager as backup)
        const locationStarted = await startNativeLocationTracking();
        if (!locationStarted) {
          toast({
            title: "Location permission required",
            description: "Please grant location permissions to receive booking alerts",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        // Start native foreground service for notifications
        await startForegroundService();
      }

      const { data, error } = await supabase.rpc("update_worker_availability", {
        p_is_available: checked,
      });

      if (error) throw error;

      setIsAvailable(checked);

      if (!checked && Capacitor.isNativePlatform()) {
        // Stop native location tracking
        await stopNativeLocationTracking();

        // Stop native foreground service
        await stopForegroundService();
      }

      toast({
        title: checked ? "Now Available" : "Now Unavailable",
        description: checked
          ? "You will receive booking alerts in your selected area"
          : "You will not receive booking alerts",
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

  return (
    <div className="bg-card border rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Label 
              htmlFor="availability" 
              className="text-base font-semibold text-foreground cursor-pointer"
            >
              {isAvailable ? "Available for Bookings" : "Currently Unavailable"}
            </Label>
            {isAvailable && (
              <span className="inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {isAvailable
              ? "You will receive booking alerts"
              : "Toggle on to start receiving bookings"}
          </p>
        </div>
        <Switch
          id="availability"
          checked={isAvailable}
          onCheckedChange={handleToggle}
          disabled={loading}
        />
      </div>
    </div>
  );
}
