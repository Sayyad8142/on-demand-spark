import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { confirmedMissingWorker } from "@/lib/accountDataCleanup";

/** Missing own worker on two successful reads, never a network/RLS error. */
export function useDeletedWorkerSession() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const check = async () => {
      const read = () => supabase.from("workers").select("id").or(`user_id.eq.${user.id},id.eq.${user.id}`).maybeSingle();
      try {
        const first = await read();
        if (cancelled || first.error || first.data) return;
        const second = await read();
        if (cancelled || !confirmedMissingWorker(first, second)) return;
        const { data } = await supabase.auth.getSession();
        if (cancelled || data.session?.user.id !== user.id) return;
        await signOut();
        queryClient.clear();
      } catch { /* No logout on connectivity failure. */ }
    };
    void check();
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; window.removeEventListener("online", check); document.removeEventListener("visibilitychange", onVisible); };
  }, [user?.id, signOut, queryClient]);
}