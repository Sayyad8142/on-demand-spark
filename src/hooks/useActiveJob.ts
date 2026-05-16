import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { isBeforeScheduledDispatchWindow, logScheduledOfferDecision } from "@/lib/scheduledBookingGuards";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];

/**
 * Fetches the active job for the authenticated worker.
 * @param userId - The auth user id (auth.uid)
 */
export function useActiveJob(userId: string | undefined) {
  const [activeJob, setActiveJob] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [workerId, setWorkerId] = useState<string | null>(null);

  // Resolve the worker's id from their user_id (or legacy id match)
  useEffect(() => {
    let cancelled = false;

    const resolveWorkerId = async () => {
      if (!userId) {
        setWorkerId(null);
        setLoading(false);
        return;
      }

      try {
        // Try by user_id first
        let { data } = await supabase
          .from("workers")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

        // Fallback: id match (legacy workers where id === userId)
        if (!data) {
          const { data: legacyData } = await supabase
            .from("workers")
            .select("id")
            .eq("id", userId)
            .maybeSingle();
          data = legacyData;
        }

        if (!cancelled) {
          const resolvedId = data?.id ?? null;
          console.log("🔍 useActiveJob resolved worker_id:", resolvedId);
          setWorkerId(resolvedId);
        }
      } catch (err) {
        console.error("❌ Failed to resolve worker id:", err);
        if (!cancelled) setWorkerId(null);
      }
    };

    resolveWorkerId();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Fetch the active booking for this worker
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
      if (data && data.status === "assigned" && isBeforeScheduledDispatchWindow(data)) {
        logScheduledOfferDecision(data, "query", false);
        console.log("📅 Future scheduled assignment hidden from active job card:", data.id);
        setActiveJob(null);
        return;
      }

      if (data) logScheduledOfferDecision(data, "query", true);
      setActiveJob(data);
    } catch (error) {
      console.error("❌ Error fetching active job:", error);
    } finally {
      setLoading(false);
    }
  }, [workerId]);

  // Re-fetch whenever workerId becomes available / changes
  useEffect(() => {
    fetchActiveJob();
  }, [fetchActiveJob]);

  // Realtime updates for this worker's bookings
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
          if (booking.status === "assigned" && isBeforeScheduledDispatchWindow(booking)) {
            logScheduledOfferDecision(booking, "realtime", false);
            setActiveJob(null);
            return;
          }
          if (["assigned", "accepted", "on_the_way", "started"].includes(booking.status)) {
            logScheduledOfferDecision(booking, "realtime", true);
            setActiveJob(booking);
          } else if (booking.status === "cancelled") {
            window.dispatchEvent(new CustomEvent("bookingCancelledAlert", { detail: { bookingId: booking.id, source: "realtime" } }));
            setActiveJob(null);
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

  // Native overlay accept triggers custom event; refresh active job when that fires
  // Use retry logic because workerId may not be resolved yet on cold start
  useEffect(() => {
    const onBookingAccepted = () => {
      console.log('📡 bookingAccepted event received, will retry fetchActiveJob...');
      let attempts = 0;
      const maxAttempts = 5;
      const tryFetch = () => {
        attempts++;
        console.log(`🔄 bookingAccepted fetch attempt ${attempts}/${maxAttempts}`);
        fetchActiveJob();
        if (attempts < maxAttempts) {
          setTimeout(tryFetch, 1000);
        }
      };
      // Start after a short delay to let workerId resolve
      setTimeout(tryFetch, 500);
    };

    window.addEventListener("bookingAccepted", onBookingAccepted);

    // Admin reassignment — clear immediately and refetch to confirm.
    const onBookingReassigned = async (event: Event) => {
      const bookingId = (event as CustomEvent)?.detail?.bookingId;
      setActiveJob((prev) => {
        if (prev && prev.id === bookingId) {
          console.log('[BOOKING_REASSIGNED_MATCHED_ACTIVE]', { bookingId });
          console.log('[BOOKING_REASSIGNED_CLEARED_LOCAL]', { bookingId });
          try {
            window.dispatchEvent(new CustomEvent('nativeNavigation', { detail: { screen: 'home' } }));
          } catch {}
          return null;
        }
        console.log('[BOOKING_REASSIGNED_IGNORED_NOT_ACTIVE]', { bookingId, activeId: prev?.id ?? null });
        return prev;
      });
      try {
        await fetchActiveJob();
        console.log('[BOOKING_REASSIGNED_REFETCH_DONE]', { bookingId });
      } catch (e) {
        console.warn('[BOOKING_REASSIGNED_REFETCH_DONE] failed', e);
      }
    };
    window.addEventListener("bookingReassigned", onBookingReassigned);

    return () => {
      window.removeEventListener("bookingAccepted", onBookingAccepted);
      window.removeEventListener("bookingReassigned", onBookingReassigned);
    };
  }, [fetchActiveJob]);

  // Refetch active job when app comes back to foreground (native)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const onResume = () => {
      console.log('📱 App resumed, refetching active job...');
      // Small delay to let session/auth settle
      setTimeout(() => fetchActiveJob(), 800);
    };

    // Capacitor fires appStateChange, but we also listen for visibilitychange (web fallback)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onResume();
    });

    // Listen for native navigation events (overlay opens app -> navigates to /home)
    window.addEventListener('nativeNavigation', onResume);

    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('nativeNavigation', onResume);
    };
  }, [fetchActiveJob]);

  const updateJobStatus = async (bookingId: string, newStatus: string) => {
    try {
      console.log("🔄 Updating job status:", bookingId, "to", newStatus);

      const { error } = await supabase.rpc("worker_set_booking_status", {
        p_booking_id: bookingId,
        p_new_status: newStatus,
      });

      if (error) {
        console.error("❌ Error from worker_set_booking_status:", error);
        throw error;
      }

      console.log("✅ Status update successful");

      if (newStatus === "completed") {
        console.log("🎉 Clearing active job immediately");
        setActiveJob(null);
      }

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
