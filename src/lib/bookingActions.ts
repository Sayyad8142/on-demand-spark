import { supabase } from "@/integrations/supabase/client";
import { ensureValidSessionForApiCall } from "./sessionManager";
import { toast } from "@/hooks/use-toast";

/**
 * Try to accept a booking - NEVER triggers logout on any error
 */
export async function tryAccept(bookingId: string): Promise<{ success: boolean; error?: string }> {
  const sessionValid = await ensureValidSessionForApiCall();
  if (!sessionValid) {
    toast({
      title: "Session issue",
      description: "Please try again. If the problem persists, close and reopen the app.",
      variant: "destructive",
    });
    return { success: false, error: "Session needs refresh. Please try again." };
  }
  
  try {
    const { data, error } = await supabase.rpc("try_accept_booking", { p_booking_id: bookingId });
    
    if (error) {
      console.error("❌ RPC error accepting booking:", error);
      return { success: false, error: error.message };
    }
    
    const result = data as { success?: boolean; error?: string } | null;
    if (!result?.success) {
      return { success: false, error: result?.error || "Failed to accept booking" };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error("❌ Unexpected error accepting booking:", error);
    return { success: false, error: error?.message || "Unexpected error" };
  }
}

/**
 * Reject a booking - NEVER triggers logout on any error
 */
export async function rejectBooking(bookingId: string, workerId: string) {
  const sessionValid = await ensureValidSessionForApiCall();
  if (!sessionValid) {
    console.warn("⚠️ Session not valid for reject");
    return { success: false, shouldNotify: false };
  }
  
  try {
    const { data, error } = await supabase.rpc("reject_booking_request", {
      p_booking_id: bookingId,
      p_worker_id: workerId,
    });

    if (error) {
      console.error("❌ Error rejecting booking:", error);
      return { success: false, shouldNotify: false };
    }

    const result = data as { success?: boolean; should_notify?: boolean; next_tier?: number };

    if (result?.should_notify && result?.next_tier) {
      try {
        await supabase.functions.invoke("notify-next-tier", {
          body: { booking_id: bookingId, tier: result.next_tier },
        });
      } catch (notifyError) {
        console.error("⚠️ Error notifying next tier:", notifyError);
      }
    }

    return { success: true, shouldNotify: result?.should_notify || false };
  } catch (error: any) {
    console.error("❌ Unexpected error rejecting booking:", error);
    return { success: false, shouldNotify: false };
  }
}