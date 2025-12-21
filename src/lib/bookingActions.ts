import { supabase } from "@/integrations/supabase/client";
import { callFn, isPermissionError, getErrorMessage } from "@/lib/api";

export async function tryAccept(bookingId: string) {
  const result = await callFn<{ success: boolean }>("booking-action", {
    booking_id: bookingId,
    action: "accept"
  });
  
  if (!result.ok) {
    console.error("❌ Accept booking failed:", result.error);
    return false;
  }
  
  return true;
}

export async function rejectBooking(bookingId: string, workerId: string) {
  const result = await callFn<{ success: boolean; should_notify?: boolean }>("booking-action", {
    booking_id: bookingId,
    action: "reject"
  });

  if (!result.ok) {
    console.error("❌ Error rejecting booking:", result.error);
    return { success: false, shouldNotify: false };
  }

  return { success: true, shouldNotify: result.data?.should_notify || false };
}

export async function updateBookingStatus(bookingId: string, action: "on_the_way" | "start" | "complete") {
  const result = await callFn<{ success: boolean }>("booking-action", {
    booking_id: bookingId,
    action
  });

  if (!result.ok) {
    console.error(`❌ Error updating booking status to ${action}:`, result.error);
    return { success: false, error: result.error };
  }

  return { success: true };
}
