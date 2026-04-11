import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type Worker = Database["public"]["Tables"]["workers"]["Row"];

let ensuredForUser: string | null = null;

async function fetchWorkerData(userId: string): Promise<Worker | null> {
  console.log('🔍 Fetching worker for user_id:', userId);

  // First, try by user_id
  let { data, error } = await supabase
    .from('workers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  // Fallback: try by id (legacy)
  if (!data && !error) {
    console.log('⚠️ No worker found by user_id, trying by id');
    const legacyResult = await supabase
      .from('workers')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    data = legacyResult.data;
    error = legacyResult.error;

    if (data && !data.user_id) {
      console.log('🔗 Linking worker to auth user:', userId);
      await supabase.from('workers').update({ user_id: userId }).eq('id', data.id);
      const { data: updatedData } = await supabase
        .from('workers')
        .select('*')
        .eq('id', data.id)
        .single();
      data = updatedData;
    }
  }

  // Auto-create via RPC (one-time per userId)
  if (!data && !error && ensuredForUser !== userId) {
    ensuredForUser = userId;
    console.log('🛠️ No worker row found; attempting to auto-create via ensure_worker_profile()');
    const { error: ensureError } = await supabase.rpc('ensure_worker_profile');
    if (!ensureError) {
      const retry = await supabase
        .from('workers')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      data = retry.data;
      error = retry.error;
      if (!data && !error) {
        const retryLegacy = await supabase
          .from('workers')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        data = retryLegacy.data;
        error = retryLegacy.error;
      }
    }
  }

  if (error) throw error;

  if (data) {
    console.log('✅ Worker fetched:', data.full_name, '| user_id:', data.user_id);
    // Heartbeat: update last_active_at
    supabase
      .from('workers')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', data.id)
      .then(({ error: hbErr }) => {
        if (hbErr) console.warn('⚠️ Heartbeat update failed:', hbErr.message);
        else console.log('💓 Heartbeat: last_active_at updated');
      });
  } else {
    console.log('⚠️ No worker found for user:', userId);
  }

  return data;
}

export function useWorkerProfile(userId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: worker = null, isLoading: loading } = useQuery({
    queryKey: ['worker-profile', userId],
    queryFn: () => fetchWorkerData(userId!),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000, // Consider fresh for 2 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  const refetch = useCallback(() => {
    if (userId) {
      queryClient.invalidateQueries({ queryKey: ['worker-profile', userId] });
    }
  }, [queryClient, userId]);

  const updateAvailability = useCallback(async (isAvailable: boolean) => {
    if (!userId) return;
    const { data, error } = await supabase.rpc('update_worker_availability', {
      p_is_available: isAvailable
    });
    if (error) throw error;
    const result = data as { success: boolean; error?: string } | null;
    if (result && !result.success) throw new Error(result.error || 'Failed to update availability');
    refetch();
  }, [userId, refetch]);

  const updateWorker = useCallback(async (updates: Partial<Worker>) => {
    if (!worker?.id) throw new Error('Worker profile not loaded');
    const { data: { user } } = await supabase.auth.getUser();
    const updatePayload = {
      ...updates,
      user_id: user?.id || worker.user_id,
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
