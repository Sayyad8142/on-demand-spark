import { displayText } from "@/i18n/display";
import { isAccountRecoveryRequired, ACCOUNT_RECOVERY_MESSAGE } from "@/lib/workerLinkage";
import { buildAvailabilityRequest } from "@/lib/availabilityRequest";
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { WORKER_PROFILE_COLUMNS, sanitizeWorkerUpdate, type WorkerProfile } from "@/lib/workerProfileColumns";

type Worker = WorkerProfile;
type WorkerUpdate = Partial<Database["public"]["Tables"]["workers"]["Update"]>;

let ensuredForUser: string | null = null;

async function fetchWorkerData(userId: string): Promise<Worker | null> {
  console.log('🔍 Fetching worker for user_id:', userId);

  // First, try by user_id
  let { data, error } = await supabase
    .from('workers')
    .select(WORKER_PROFILE_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  // Fallback: try by id (legacy)
  if (!data && !error) {
    console.log('⚠️ No worker found by user_id, trying by id');
    const legacyResult = await supabase
      .from('workers')
      .select(WORKER_PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle();

    data = legacyResult.data;
    error = legacyResult.error;
    // Account linking (user_id) is server-only; the app never writes it.
  }

  // A missing worker must go through fresh secure signup, never phone re-linking.
  // Deleted-session cleanup is owned by useDeletedWorkerSession.

  if (error) throw error;
  const profile = (data ?? null) as unknown as Worker | null;

  if (profile) {
    console.log('✅ Worker fetched:', profile.full_name, '| user_id:', profile.user_id);
    // Heartbeat: update last_active_at
    supabase
      .from('workers')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', profile.id)
      .then(({ error: hbErr }) => {
        if (hbErr) console.warn('⚠️ Heartbeat update failed:', hbErr.message);
        else console.log('💓 Heartbeat: last_active_at updated');
      });
  } else {
    console.log('⚠️ No worker found for user:', userId);
  }

  return profile;
}

export function useWorkerProfile(userId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: worker = null, isLoading: loading } = useQuery({
    queryKey: ['worker-profile', userId],
    queryFn: () => userId ? fetchWorkerData(userId) : Promise.resolve(null),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // Consider fresh for 2 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  const refetch = useCallback(() => {
    if (userId) {
      queryClient.invalidateQueries({ queryKey: ['worker-profile', userId] });
    }
  }, [queryClient, userId]);

  // Only for a deliberate worker tap — never call from lifecycle/health code.
  const updateAvailability = useCallback(async (isAvailable: boolean) => {
    if (!userId) return;
    const { data, error } = await supabase.functions.invoke("update-availability", {
      body: buildAvailabilityRequest(isAvailable, "toggle_tap"),
    });
    if (error) throw error;
    if (!data.ok) throw new Error(data.error || 'Failed to update availability');
    refetch();
  }, [userId, refetch]);

  const updateWorker = useCallback(async (updates: WorkerUpdate) => {
    if (!worker?.id) throw new Error('Worker profile not loaded');
    // id/user_id are server-owned and are stripped from every update.
    const updatePayload = {
      ...sanitizeWorkerUpdate(updates),
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase
      .from('workers')
      .update(updatePayload)
      .eq('id', worker.id);
    if (error) throw error;
    refetch();
  }, [worker, refetch]);

  return { worker, loading, updateAvailability, updateWorker, refetch };
}
