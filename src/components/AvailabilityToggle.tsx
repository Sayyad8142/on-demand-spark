import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
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
  const {
    toast
  } = useToast();
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
      // Use the RPC that takes worker_id_param directly since we have workerId prop
      // This works with Firebase auth (no Supabase session needed)
      const { data, error } = await supabase.rpc("update_worker_availability", {
        worker_id_param: workerId,
        is_available_param: checked
      });
      
      if (error) throw error;
      
      // The RPC returns boolean (FOUND), check if update was successful
      if (data === false) {
        throw new Error("Worker not found");
      }
      
      setIsAvailable(checked);
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