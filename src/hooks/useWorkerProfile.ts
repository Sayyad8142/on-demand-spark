import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type Worker = Database["public"]["Tables"]["workers"]["Row"];

export function useWorkerProfile(userId: string | undefined) {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWorker = async () => {
    if (!userId) return;
    
    try {
      const { data, error } = await supabase
        .from('workers')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setWorker(data);
    } catch (error) {
      console.error('Error fetching worker:', error);
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
      const { error } = await supabase.rpc('update_worker_availability', {
        p_is_available: isAvailable
      });

      if (error) throw error;
      
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