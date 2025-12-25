import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type Worker = Database["public"]["Tables"]["workers"]["Row"];

export function useWorkerProfile(userId: string | undefined) {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);
  const ensuredForUserRef = useRef<string | null>(null);

  const fetchWorker = async () => {
    if (!userId) return;

    try {
      console.log('🔍 Fetching worker for user_id:', userId);

      // First, try to find worker by user_id (preferred method)
      let { data, error } = await supabase
        .from('workers')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      // If not found by user_id, try by id (legacy workers)
      if (!data && !error) {
        console.log('⚠️ No worker found by user_id, trying by id');
        const legacyResult = await supabase
          .from('workers')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        data = legacyResult.data;
        error = legacyResult.error;

        // If found by id but user_id is not set, link the worker to this auth user
        if (data && !data.user_id) {
          console.log('🔗 Linking worker to auth user:', userId);
          const { error: updateError } = await supabase
            .from('workers')
            .update({ user_id: userId })
            .eq('id', data.id);

          if (updateError) {
            console.error('❌ Failed to link worker to user:', updateError);
          } else {
            console.log('✅ Worker linked successfully');
            // Refetch to get updated data
            const { data: updatedData } = await supabase
              .from('workers')
              .select('*')
              .eq('id', data.id)
              .single();
            data = updatedData;
          }
        }
      }

      // If still not found, try to auto-create the worker row from auth claims (one-time per userId)
      if (!data && !error && ensuredForUserRef.current !== userId) {
        ensuredForUserRef.current = userId;
        console.log('🛠️ No worker row found; attempting to auto-create via ensure_worker_profile()');

        const { error: ensureError } = await supabase.rpc('ensure_worker_profile');
        if (ensureError) {
          console.error('❌ ensure_worker_profile failed:', ensureError);
        } else {
          // Retry fetch
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
      } else {
        console.log('⚠️ No worker found for user:', userId);
      }

      setWorker(data);
    } catch (error) {
      console.error('❌ Error fetching worker:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorker();
  }, [userId]);

  const updateAvailability = async (isAvailable: boolean) => {
    if (!userId) return;

    try {
      // Use RPC function to update availability with proper permissions
      const { data, error } = await supabase.rpc('update_worker_availability', {
        p_is_available: isAvailable
      });

      if (error) {
        console.error('RPC error:', error);
        throw error;
      }

      // Check the response from the RPC function
      const result = data as { success: boolean; error?: string; worker_id?: string; is_available?: boolean } | null;
      
      if (result && !result.success) {
        console.error('Update failed:', result.error);
        throw new Error(result.error || 'Failed to update availability');
      }

      console.log('Availability updated successfully:', result);
      
      // Refetch to get updated worker data
      await fetchWorker();
    } catch (error) {
      console.error('Error updating availability:', error);
      throw error;
    }
  };

  const updateWorker = async (updates: Partial<Worker>) => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from('workers')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) throw error;
      
      await fetchWorker();
    } catch (error) {
      console.error('Error updating worker:', error);
      throw error;
    }
  };

  return { worker, loading, updateAvailability, updateWorker, refetch: fetchWorker };
}