import { supabase } from "@/integrations/supabase/client";

// Helper to ensure session is valid before making API calls
async function ensureValidSession(): Promise<boolean> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
      console.error('❌ No valid session for API call');
      return false;
    }
    
    // Check if token is about to expire (within 2 minutes)
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    const twoMinutes = 2 * 60 * 1000;
    
    if (Date.now() > expiresAt - twoMinutes) {
      console.log('🔄 Token expiring, refreshing before API call...');
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('❌ Failed to refresh session:', refreshError);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error checking session:', error);
    return false;
  }
}

export async function tryAccept(bookingId: string): Promise<{ success: boolean; error?: string }> {
  // Ensure valid session before accepting
  const sessionValid = await ensureValidSession();
  if (!sessionValid) {
    return { success: false, error: "Session expired. Please log in again." };
  }
  
  const { data, error } = await supabase.rpc("try_accept_booking", { p_booking_id: bookingId });
  
  if (error) {
    console.error("❌ RPC error accepting booking:", error);
    return { success: false, error: error.message };
  }
  
  const result = data as { success?: boolean; error?: string } | null;
  
  if (!result?.success) {
    console.error("❌ Booking accept failed:", result?.error);
    return { success: false, error: result?.error || "Failed to accept booking" };
  }
  
  console.log("✅ Booking accepted successfully");
  return { success: true };
}

export async function rejectBooking(bookingId: string, workerId: string) {
  // Ensure valid session before rejecting
  const sessionValid = await ensureValidSession();
  if (!sessionValid) {
    return { success: false, shouldNotify: false };
  }
  
  const { data, error } = await supabase.rpc("reject_booking_request", {
    p_booking_id: bookingId,
    p_worker_id: workerId,
  });

  if (error) {
    console.error("❌ Error rejecting booking:", error);
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
}
