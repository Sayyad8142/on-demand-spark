import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WORKER_BOOKING_COLUMNS } from "@/lib/workerBookingColumns";
import type { Database } from "@/integrations/supabase/types";
import { ACTIVE_WORK_STATUSES, isActiveWorkStatus } from "@/lib/workSafety";
import { endedBookingIdFromRefetch, endedBookingIdFromUpdate, releaseNativeBookingLock } from "@/lib/bookingEndRelease";
import { isBeforeScheduledDispatchWindow } from "@/lib/scheduledBookingGuards";
import { mergeActiveBooking, workerVisibleBooking } from "@/lib/activeBookingCache";

type Booking = Omit<Database["public"]["Tables"]["bookings"]["Row"], "completion_otp">;
/** Account-keyed memory cache shared by Home and App. Cache is display-only. */
export function useActiveJob(userId: string | undefined) {
  const client = useQueryClient();
  const worker = useQuery({
    queryKey: ["active-worker-id", userId], enabled: !!userId, staleTime: 60_000,
    queryFn: async () => {
      const result = await supabase.from("workers").select("id").eq("user_id", userId ?? "").maybeSingle();
      if (result.error) throw result.error;
      if (result.data) return result.data.id;
      const legacy = await supabase.from("workers").select("id").eq("id", userId ?? "").maybeSingle();
      if (legacy.error) throw legacy.error;
      return legacy.data?.id ?? null;
    },
  });
  const workerId = worker.data;
  const key = ["active-booking", userId, workerId] as const;
  const job = useQuery({
    queryKey: key, enabled: !!userId && !!workerId, staleTime: 0,
    queryFn: async ({ signal }) => {
      const result = await supabase.from("bookings").select(WORKER_BOOKING_COLUMNS)
        .eq("worker_id", workerId ?? "").in("status", [...ACTIVE_WORK_STATUSES])
        .order("created_at", { ascending: false }).limit(1).abortSignal(signal).maybeSingle();
      if (result.error) throw result.error;
      if (signal.aborted) throw new Error("Cancelled booking refresh");
      const previous = client.getQueryData<Booking | null>(key);
      releaseNativeBookingLock(endedBookingIdFromRefetch(previous?.id ?? null, result.data, true));
      const data = result.data as Booking | null;
      return data?.status === "assigned" && isBeforeScheduledDispatchWindow(data) ? null : data;
    },
  });
  const refetch = useCallback(async () => {
    if (!userId || !workerId) return;
    await client.invalidateQueries({ queryKey: ["active-booking", userId, workerId] });
  }, [client, userId, workerId]);

  useEffect(() => {
    if (!userId || !workerId) return;
    const queryKey = ["active-booking", userId, workerId];
    const channel = supabase.channel(`active-job:${userId}:${Math.random()}`).on("postgres_changes", {
      event: "*", schema: "public", table: "bookings", filter: `worker_id=eq.${workerId}`,
    }, (payload) => {
      if (payload.eventType === "DELETE") { void refetch(); return; }
      const incoming = workerVisibleBooking(payload.new) as Booking | null;
      if (!incoming) { void refetch(); return; }
      const endedId = endedBookingIdFromUpdate(incoming, workerId);
      releaseNativeBookingLock(endedId);
      if (incoming.status === "cancelled") window.dispatchEvent(new CustomEvent("bookingCancelledAlert", { detail: { bookingId: incoming.id, source: "realtime" } }));
      // Cancel an older HTTP read before writing the newer server event.
      void client.cancelQueries({ queryKey }).then(() => {
        client.setQueryData<Booking | null>(queryKey, (old) => mergeActiveBooking(old ?? null, incoming, workerId) as Booking | null);
      });
    }).subscribe();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const refreshSoon = () => { void refetch(); };
    const accepted = () => {
      refreshSoon();
      for (const delay of [1000, 2000, 3000, 4000]) {
        const timer = setTimeout(() => { timers.delete(timer); refreshSoon(); }, delay);
        timers.add(timer);
      }
    };
    const ended = (event: Event) => {
      const id = (event as CustomEvent<{ bookingId?: string }>).detail?.bookingId;
      void client.cancelQueries({ queryKey }).then(() => {
        client.setQueryData<Booking | null>(queryKey, old => old?.id === id ? null : old ?? null);
        refreshSoon();
      });
    };
    const visible = () => { if (document.visibilityState === "visible") refreshSoon(); };
    window.addEventListener("bookingAccepted", accepted);
    for (const name of ["bookingStarted", "bookingAcceptanceClosed", "nativeNavigation", "online"]) window.addEventListener(name, refreshSoon);
    for (const name of ["bookingCompleted", "bookingReassigned", "bookingCancelledAlert"]) window.addEventListener(name, ended);
    document.addEventListener("visibilitychange", visible);
    return () => {
      void supabase.removeChannel(channel);
      timers.forEach(clearTimeout);
      window.removeEventListener("bookingAccepted", accepted);
      for (const name of ["bookingStarted", "bookingAcceptanceClosed", "nativeNavigation", "online"]) window.removeEventListener(name, refreshSoon);
      for (const name of ["bookingCompleted", "bookingReassigned", "bookingCancelledAlert"]) window.removeEventListener(name, ended);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [client, userId, workerId, refetch]);

  const updateJobStatus = async (bookingId: string, newStatus: string) => {
    const { error } = await supabase.rpc("worker_set_booking_status", { p_booking_id: bookingId, p_new_status: newStatus });
    if (error) throw error;
    if (!isActiveWorkStatus(newStatus)) {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<Booking | null>(key, old => old?.id === bookingId ? null : old ?? null);
    }
    await refetch();
    return true;
  };
  return {
    activeJob: userId ? job.data ?? null : null,
    loading: !!userId && (worker.isPending || (!!workerId && job.isPending)),
    checked: !userId || (worker.isSuccess && (!workerId || job.isSuccess)),
    updateJobStatus, refetch,
  };
}
