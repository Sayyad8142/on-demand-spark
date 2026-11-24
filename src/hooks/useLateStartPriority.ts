import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { LATE_START_PRIORITY_ENABLED, parseLateStartPriority } from "@/lib/lateStartPriority";

export function useLateStartPriority(bookingId: string, pendingStart: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["late-start-priority", user?.id, bookingId],
    enabled: LATE_START_PRIORITY_ENABLED && !!user && pendingStart,
    queryFn: async () => {
      // Proposed read-only RPC; activation awaits the Admin-owned contract.
      const rpc = supabase.rpc as unknown as (name: string, args: { p_booking_id: string }) => PromiseLike<{ data: unknown; error: unknown }>;
      const { data, error } = await rpc("get_my_late_start_priority", { p_booking_id: bookingId });
      if (error) throw new Error("Late Start priority unavailable");
      return parseLateStartPriority(data, bookingId);
    },
    staleTime: 0, refetchOnMount: "always", refetchInterval: 15_000, refetchIntervalInBackground: false, retry: false,
  });
}