import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { callFn, isPermissionError, getErrorMessage } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type Worker = Database["public"]["Tables"]["workers"]["Row"];

export function useWorkerProfile(userId: string | undefined) {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

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
      // Use Edge Function for protected write
      const result = await callFn<{ success: boolean; is_available: boolean }>("set-availability", {
        is_available: isAvailable
      });

      if (!result.ok) {
        if (isPermissionError(result)) {
          toast({
            title: "Permission Error",
            description: getErrorMessage(result),
            variant: "destructive"
          });
        }
        throw new Error(result.error);
      }

      console.log('Availability updated successfully via Edge Function');
      
      // Refetch to get updated worker data
      await fetchWorker();
    } catch (error) {
      console.error('Error updating availability:', error);
      throw error;
    }
  };

  const updateWorker = async (updates: Partial<Worker>) => {
    if (!userId) return;
    // TODO: Use Edge Function for protected writes
    console.log('⚠️ updateWorker: Direct update not supported, use Edge Function');
  };

  return { worker, loading, updateAvailability, updateWorker, refetch: fetchWorker };
}
