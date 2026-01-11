import { supabase } from "@/integrations/supabase/client";
import { ensureValidSessionForApiCall, safeRefreshSession } from "./sessionManager";
import { toast } from "@/hooks/use-toast";

/**
 * Try to accept a booking
 * NEVER triggers logout on any error
 */
export async function tryAccept(bookingId: string): Promise<{ success: boolean; error?: string }> {
  // Ensure valid session before accepting
  const sessionValid = await ensureValidSessionForApiCall();
  if (!sessionValid) {
    // Show toast but DON'T logout
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
      
      // If it's an auth error, try refresh and retry once
      if (error.message?.includes("JWT") || error.code === "PGRST301") {
        console.log("🔄 Auth error on accept, refreshing and retrying...");
        const refreshed = await safeRefreshSession();
        if (refreshed) {
          // Retry once
          const { data: retryData, error: retryError } = await supabase.rpc("try_accept_booking", { p_booking_id: bookingId });
          if (!retryError) {
            const retryResult = retryData as { success?: boolean; error?: string } | null;
            if (retryResult?.success) {
              console.log("✅ Booking accepted on retry");
              return { success: true };
            }
          }
        }
      }
      
      return { success: false, error: error.message };
    }
    
    const result = data as { success?: boolean; error?: string } | null;
    
    if (!result?.success) {
      console.error("❌ Booking accept failed:", result?.error);
      return { success: false, error: result?.error || "Failed to accept booking" };
    }
    
    console.log("✅ Booking accepted successfully");
    return { success: true };
  } catch (error: any) {
    console.error("❌ Unexpected error accepting booking:", error);
    return { success: false, error: error?.message || "Unexpected error" };
  }
}

/**
 * Reject a booking
 * NEVER triggers logout on any error
 */
export async function rejectBooking(bookingId: string, workerId: string) {
  // Ensure valid session before rejecting
  const sessionValid = await ensureValidSessionForApiCall();
  if (!sessionValid) {
    // Just log and return failure - DON'T logout or show scary messages
    console.warn("⚠️ Session not valid for reject, but not logging out");
    return { success: false, shouldNotify: false };
  }
  
  try {
    const { data, error } = await supabase.rpc("reject_booking_request", {
      p_booking_id: bookingId,
      p_worker_id: workerId,
    });

    if (error) {
      console.error("❌ Error rejecting booking:", error);
      
      // If it's an auth error, try refresh and retry once
      if (error.message?.includes("JWT") || error.code === "PGRST301") {
        console.log("🔄 Auth error on reject, refreshing and retrying...");
        const refreshed = await safeRefreshSession();
        if (refreshed) {
          // Retry once
          const { data: retryData, error: retryError } = await supabase.rpc("reject_booking_request", {
            p_booking_id: bookingId,
            p_worker_id: workerId,
          });
          
          if (!retryError) {
            const retryResult = retryData as { success?: boolean; should_notify?: boolean; next_tier?: number };
            if (retryResult?.success) {
              // Handle notification for retry
              if (retryResult?.should_notify && retryResult?.next_tier) {
                try {
                  await supabase.functions.invoke("notify-next-tier", {
                    body: { booking_id: bookingId, tier: retryResult.next_tier },
                  });
                } catch (notifyError) {
                  console.error("⚠️ Error notifying next tier:", notifyError);
                }
              }
              return { success: true, shouldNotify: retryResult?.should_notify || false };
            }
          }
        }
      }
      
      // Return failure but DON'T logout
      return { success: false, shouldNotify: false };
    }

    const result = data as { success?: boolean; should_notify?: boolean; next_tier?: number };

    // If next tier should be notified, call the edge function
    if (result?.should_notify && result?.next_tier) {
      try {
        await supabase.functions.invoke("notify-next-tier", {
          body: {
            booking_id: bookingId,
            tier: result.next_tier,
          },
        });
        console.log(`✅ Notified next tier ${result.next_tier}`);
      } catch (notifyError) {
        console.error("⚠️ Error notifying next tier:", notifyError);
        // Don't fail the rejection if notification fails
      }
    }

    return { success: true, shouldNotify: result?.should_notify || false };
  } catch (error: any) {
    console.error("❌ Unexpected error rejecting booking:", error);
    // Return failure but NEVER logout
    return { success: false, shouldNotify: false };
  }
}
