import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface AvailabilityToggleProps {
  workerId: string;
  className?: string;
}

export function AvailabilityToggle({ workerId, className }: AvailabilityToggleProps) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pressed, setPressed] = useState(false);
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

  const handleToggle = async () => {
    if (loading) return;
    const newValue = !isAvailable;
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
        title: newValue ? "Now Available" : "Now Unavailable",
        description: newValue
          ? "You will receive booking alerts"
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
            {isAvailable ? "Available for Bookings" : "Currently Unavailable"}
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
