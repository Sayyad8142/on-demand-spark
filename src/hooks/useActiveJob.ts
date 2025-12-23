import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];

// Note: This hook expects the *worker row id* (workers.id), not the auth user id.
export function useActiveJob(workerId: string | undefined) {
  const [activeJob, setActiveJob] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchActiveJob = useCallback(async () => {
    if (!workerId) {
      setActiveJob(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log("🔍 Fetching active job for worker_id:", workerId);

      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("worker_id", workerId)
        .in("status", ["assigned", "accepted", "on_the_way", "started"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      console.log(
        "📦 Active job fetched:",
        data ? `Found booking ${data.id}, flat: ${data.flat_no}` : "No active job"
      );
      setActiveJob(data);
    } catch (error) {
      console.error("❌ Error fetching active job:", error);
    } finally {
      setLoading(false);
    }
  }, [workerId]);

  // Initial fetch + when workerId changes
  useEffect(() => {
    fetchActiveJob();
  }, [fetchActiveJob]);

  // Realtime updates for this worker
  useEffect(() => {
    if (!workerId) return;

    const channel = supabase
      .channel(`active-job-updates:${workerId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `worker_id=eq.${workerId}`,
        },
        (payload) => {
          const booking = payload.new as Booking;
          console.log("📡 Realtime booking update:", booking.id, "status:", booking.status);
          if (["assigned", "accepted", "on_the_way", "started"].includes(booking.status)) {
            setActiveJob(booking);
          } else {
            setActiveJob(null);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bookings",
          filter: `worker_id=eq.${workerId}`,
        },
        (payload) => {
          const booking = payload.new as Booking;
          console.log("📡 Realtime booking insert:", booking.id, "status:", booking.status);
          if (["assigned", "accepted", "on_the_way", "started"].includes(booking.status)) {
            setActiveJob(booking);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workerId]);

  // Native overlay acceptance comes in via deep link; ensure UI refresh even if realtime is delayed.
  useEffect(() => {
    const onBookingAccepted = () => {
      // Small delay to allow DB transaction to commit
      setTimeout(() => {
        fetchActiveJob();
      }, 400);
    };

    window.addEventListener("bookingAccepted", onBookingAccepted);
    return () => window.removeEventListener("bookingAccepted", onBookingAccepted);
  }, [fetchActiveJob]);

  const updateJobStatus = async (bookingId: string, newStatus: string) => {
    try {
      console.log("🔄 Updating job status:", bookingId, "to", newStatus);

      const { error } = await supabase.rpc("worker_set_booking_status", {
        booking_id_param: bookingId,
        new_status_param: newStatus,
      });

      if (error) {
        console.error("❌ Error from worker_set_booking_status:", error);
        throw error;
      }

      console.log("✅ Status update successful");

      // If completed, immediately clear the active job for instant UI update
      if (newStatus === "completed") {
        console.log("🎉 Clearing active job immediately");
        setActiveJob(null);
      }

      // Wait for database transaction to commit before refetching
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log("🔄 Refetching active job after delay");
      await fetchActiveJob();

      return true;
    } catch (error) {
      console.error("❌ Error updating job status:", error);
      throw error;
    }
  };

  return { activeJob, loading, updateJobStatus, refetch: fetchActiveJob };
}
