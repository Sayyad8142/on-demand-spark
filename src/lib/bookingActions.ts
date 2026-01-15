import { supabase } from "@/integrations/supabase/client";
import { ensureValidSessionForApiCall } from "./sessionManager";
import { toast } from "@/hooks/use-toast";

/**
 * Try to accept a booking - NEVER triggers logout on any error
 * Includes retry logic for cold start scenarios
 */
export async function tryAccept(bookingId: string): Promise<{ success: boolean; error?: string }> {
  // Cold-start + token restore can be slow, especially when app was killed.
  // Give it a bit more time before we declare failure.
  const maxAttempts = 8;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[tryAccept] Attempt ${attempt}/${maxAttempts} for booking ${bookingId}`);

    const sessionValid = await ensureValidSessionForApiCall();
    if (!sessionValid) {
      if (attempt < maxAttempts) {
        const waitMs = Math.min(500 * attempt, 2000);
        console.log(
          `[tryAccept] Session not valid on attempt ${attempt}, waiting ${waitMs}ms and retrying...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      toast({
        title: "Session issue",
        description: "Please try again. If the problem persists, close and reopen the app.",
        variant: "destructive",
      });
      return { success: false, error: "Session needs refresh. Please try again." };
    }
    
    try {
      console.log(`[tryAccept] Calling RPC try_accept_booking for ${bookingId}`);
      const { data, error } = await supabase.rpc("try_accept_booking", { p_booking_id: bookingId });
      
      if (error) {
        console.error("❌ RPC error accepting booking:", error);
        
        // Retry on network/transient errors
        if (
          attempt < maxAttempts &&
          (error.message?.includes("network") ||
            error.message?.includes("fetch") ||
            error.message?.includes("Failed to fetch"))
        ) {
          console.log(`[tryAccept] Network error on attempt ${attempt}, retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 750));
          continue;
        }
        
        return { success: false, error: error.message };
      }
      
      const result = data as { success?: boolean; error?: string } | null;
      console.log(`[tryAccept] RPC result:`, result);
      
      if (!result?.success) {
        return { success: false, error: result?.error || "Failed to accept booking" };
      }
      
      console.log(`[tryAccept] ✅ Successfully accepted booking ${bookingId}`);
      return { success: true };
    } catch (error: any) {
      console.error("❌ Unexpected error accepting booking:", error);
      
      if (attempt < maxAttempts) {
        console.log(`[tryAccept] Unexpected error on attempt ${attempt}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      return { success: false, error: error?.message || "Unexpected error" };
    }
  }
  
  return { success: false, error: "Failed after multiple attempts" };
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