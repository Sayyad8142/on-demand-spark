import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { startForegroundService, stopForegroundService } from "@/lib/foregroundService";
import { Capacitor } from '@capacitor/core';
import { useOfflineMode } from "@/hooks/useOfflineMode";
import { useOfflineSync } from "@/hooks/useOfflineSync";

interface AvailabilityToggleProps {
  workerId: string;
  className?: string;
}

export function AvailabilityToggle({
  workerId,
  className
}: AvailabilityToggleProps) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { isOnline } = useOfflineMode();
  const { addToQueue } = useOfflineSync();
  useEffect(() => {
    loadAvailability();
  }, [workerId]);
  const loadAvailability = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("workers").select("is_available").eq("id", workerId).single();
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
        await startForegroundService();
      }

      // Optimistic update
      setIsAvailable(checked);

      if (!isOnline) {
        // Queue for later if offline
        await addToQueue('update_availability', {
          userId: workerId,
          isAvailable: checked
        });
        toast({
          title: "Queued for sync",
          description: "Availability will update when you're back online"
        });
      } else {
        // Update immediately if online
        const { error } = await supabase.rpc("update_worker_availability", {
          p_is_available: checked
        });

        if (error) throw error;

        toast({
          title: checked ? "Now Available" : "Now Unavailable",
          description: checked ? "You will receive booking alerts" : "You will not receive booking alerts"
        });
      }

      if (!checked && Capacitor.isNativePlatform()) {
        await stopForegroundService();
      }
    } catch (error: any) {
      console.error("Error updating availability:", error);
      // Revert optimistic update on error
      setIsAvailable(!checked);
      toast({
        title: "Error",
        description: error.message || "Failed to update availability",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className={`border rounded-lg p-4 shadow-sm transition-colors ${
      isAvailable 
        ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" 
        : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
    } ${className || ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Label htmlFor="availability" className="text-base font-semibold text-foreground cursor-pointer">
              {isAvailable ? "Available for Bookings" : "Currently Unavailable"}
            </Label>
            {isAvailable && <span className="inline-flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
            {!isOnline && <span className="text-xs text-muted-foreground">(Offline)</span>}
          </div>
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