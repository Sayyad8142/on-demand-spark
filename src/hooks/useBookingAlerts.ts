import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { tryAccept } from "@/lib/bookingActions";
import { Capacitor } from "@capacitor/core";

export function useBookingAlerts(userId: string | undefined, isOnline: boolean, match: (b:any)=>boolean) {
  const [pending, setPending] = useState<any|null>(null);

  useEffect(() => {
    if (!userId || !isOnline) return;
    
    // On native Android, FCM + overlay handles booking alerts
    // Don't show web modal to avoid double UI
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      console.log('📱 Native Android detected - booking alerts handled by overlay, skipping web modal');
      return;
    }
    
    const channel = supabase
      .channel("booking-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bookings", filter: "status=eq.pending" },
        (payload) => {
          const b = payload.new;
          if (match(b)) {
            setPending({
              id: b.id,
              service_type: b.service_type,
              cust_name: b.cust_name,
              community: b.community,
              flat_no: b.flat_no,
              price_inr: b.price_inr ?? 0,
            });
            toast({ title: "New booking available" });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, isOnline, match]);

  const clearAlert = useCallback(() => setPending(null), []);
  const accept = useCallback(async () => {
    if (!pending) return;
    const ok = await tryAccept(pending.id);
    if (!ok) {
      toast({ title: "Booking already taken", variant: "destructive" });
    } else {
      toast({ title: "Booking accepted" });
    }
    setPending(null);
  }, [pending]);

  const reject = useCallback(() => {
    setPending(null);
  }, []);

  return { pending, accept, reject, clearAlert };
}
