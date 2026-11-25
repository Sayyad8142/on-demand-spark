import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { LATE_START_PRIORITY_ENABLED, parseLateStartStatus } from "@/lib/lateStartPriority";

/**
 * Admin's live, session-scoped `get_my_late_start_status` for one pending-start booking.
 * Read on open/refocus only (no polling). Failure → null, and the card keeps its existing timer.
 */
export function useLateStartPriority(bookingId: string, pendingStart: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["late-start-priority", user?.id, bookingId],
    enabled: LATE_START_PRIORITY_ENABLED && !!user && !!bookingId && pendingStart,
    queryFn: async () => {
      const rpc = supabase.rpc as unknown as (name: string, args: { p_booking_id: string }) => PromiseLike<{ data: unknown; error: unknown }>;
      const { data, error } = await rpc("get_my_late_start_status", { p_booking_id: bookingId });
      if (error) throw new Error("Late Start status unavailable");
      return parseLateStartStatus(data, bookingId);
    },
    staleTime: 0, refetchOnMount: "always", refetchInterval: false, retry: false,
  });
}
