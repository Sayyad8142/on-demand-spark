import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { tryAccept } from "@/lib/bookingActions";
import { Capacitor } from '@capacitor/core';

export function useBookingAlerts(userId: string | undefined, isOnline: boolean, match: (b:any)=>boolean) {
  const [pending, setPending] = useState<any|null>(null);

  useEffect(() => {
    if (!userId || !isOnline) return;
    
    const channel = supabase
      .channel("booking-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bookings", filter: "status=eq.pending" },
        (payload) => {
          const b = payload.new;
          if (match(b)) {
            // On native Android, the overlay will handle the alert
            // Don't show the in-app modal to prevent duplicate alerts
            const isNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
            
            if (isNative) {
              console.log('📱 Native overlay will handle booking alert, skipping in-app modal');
              // Native overlay is triggered by FCM, no need to show web modal
              return;
            }
            
            // For web or iOS, show the in-app modal
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
