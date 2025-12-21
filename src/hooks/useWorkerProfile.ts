import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { callFn, isPermissionError, getErrorMessage } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

type Worker = Database["public"]["Tables"]["workers"]["Row"];

export function useWorkerProfile(userId: string | undefined) {
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { firebaseUser } = useAuth();

  const fetchWorker = async () => {
    if (!userId && !firebaseUser) {
      setLoading(false);
      return;
    }
    
    try {
      const firebaseUid = firebaseUser?.uid;
      console.log('🔍 Fetching worker for firebase_uid:', firebaseUid, 'or user_id:', userId);
      
      let data = null;
      let error = null;

      // Try to find worker by Firebase UID first (stored in user_id column)
      if (firebaseUid) {
        const result = await supabase
          .from('workers')
          .select('*')
          .eq('user_id', firebaseUid)
          .maybeSingle();
        
        data = result.data;
        error = result.error;
        
        if (data) {
          console.log('✅ Worker found by Firebase UID:', data.full_name);
        }
      }

      // If not found by Firebase UID and userId is provided, try by user_id or id
      if (!data && !error && userId) {
        console.log('⚠️ No worker found by Firebase UID, trying by user_id:', userId);
        const userIdResult = await supabase
          .from('workers')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        
        data = userIdResult.data;
        error = userIdResult.error;

        // Also try by id (legacy workers)
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
      }

      if (error) throw error;
      
      if (data) {
        console.log('✅ Worker fetched:', data.full_name, '| user_id:', data.user_id);
      } else {
        console.log('⚠️ No worker found');
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
  }, [userId, firebaseUser?.uid]);

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
