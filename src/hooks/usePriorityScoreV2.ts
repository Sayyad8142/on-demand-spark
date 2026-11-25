import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parsePriorityScoreV2 } from "@/lib/priorityScoreV2";

/**
 * Admin's session-scoped `get_my_priority_score`. Read when the page opens and on manual refresh only:
 * no polling, no retries, no worker id sent. Not installed, error, offline or malformed → null,
 * and the existing Priority Score card keeps working unchanged.
 */
export function usePriorityScoreV2(workerId: string | null | undefined) {
  return useQuery({
    queryKey: ["priority-score-v2", workerId],
    enabled: !!workerId,
    queryFn: async () => {
      const rpc = supabase.rpc as unknown as (name: string) => PromiseLike<{ data: unknown; error: unknown }>;
      try {
        const { data, error } = await rpc("get_my_priority_score");
        if (error) return null;
        return parsePriorityScoreV2(data);
      } catch {
        return null;
      }
    },
    staleTime: Infinity, refetchOnMount: "always", refetchOnWindowFocus: false, refetchOnReconnect: false,
    refetchInterval: false, retry: false,
  });
}
