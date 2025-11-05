import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { startBackgroundLocationTracking, stopBackgroundLocationTracking, requestBatteryOptimizationExemption } from "@/lib/backgroundLocation";
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
        await requestBatteryOptimizationExemption();
        
        // Start background location tracking
        const locationStarted = await startBackgroundLocationTracking();
        if (!locationStarted) {
          toast({
            title: "Location permission required",
            description: "Please grant location permissions to receive booking alerts",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        // Start native foreground service for continuous location tracking
        try {
          const OverlayPlugin = (window as any)?.Capacitor?.Plugins?.OverlayPlugin;
          if (OverlayPlugin?.startForegroundService) {
            await OverlayPlugin.startForegroundService();
            console.log('✅ Foreground service started for location tracking');
          }
        } catch (error) {
          console.warn('⚠️ Could not start foreground service:', error);
        }
      }

      const { data, error } = await supabase.rpc("update_worker_availability", {
        p_is_available: checked,
      });

      if (error) throw error;

      setIsAvailable(checked);

      if (!checked && Capacitor.isNativePlatform()) {
        // Stop background location tracking
        await stopBackgroundLocationTracking();

        // Stop native foreground service
        try {
          const OverlayPlugin = (window as any)?.Capacitor?.Plugins?.OverlayPlugin;
          if (OverlayPlugin?.stopForegroundService) {
            await OverlayPlugin.stopForegroundService();
            console.log('✅ Foreground service stopped');
          }
        } catch (error) {
          console.warn('⚠️ Could not stop foreground service:', error);
        }
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
    <div 
      className={`flex items-center justify-between transition-colors duration-300 ${
        isAvailable 
          ? "bg-green-50 dark:bg-green-950/30 border-2 border-green-200 dark:border-green-800 rounded-xl p-4" 
          : "bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-800 rounded-xl p-4"
      }`}
    >
      <div>
        <Label 
          htmlFor="availability" 
          className={`text-base font-semibold ${
            isAvailable 
              ? "text-green-700 dark:text-green-300" 
              : "text-red-700 dark:text-red-300"
          }`}
        >
          {isAvailable ? "Available for Bookings" : "Unavailable"}
        </Label>
        <p className={`text-sm ${
          isAvailable 
            ? "text-green-600 dark:text-green-400" 
            : "text-red-600 dark:text-red-400"
        }`}>
          {isAvailable
            ? "You will receive booking alerts"
            : "You will not receive booking alerts"}
        </p>
      </div>
      <Switch
        id="availability"
        checked={isAvailable}
        onCheckedChange={handleToggle}
        disabled={loading}
        className={isAvailable ? "data-[state=checked]:bg-green-600" : ""}
      />
    </div>
  );
}
