import { supabase } from "@/integrations/supabase/client";

export async function tryAccept(bookingId: string) {
  const { error } = await supabase.rpc("try_accept_booking", { p_booking_id: bookingId });
  return !error;
}
