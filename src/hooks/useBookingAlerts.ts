import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { tryAccept, rejectBooking } from "@/lib/bookingActions";
import { Capacitor } from "@capacitor/core";

export function useBookingAlerts(userId: string | undefined, isOnline: boolean, match: (b:any)=>boolean, workerId?: string | null) {
  const [pending, setPending] = useState<any|null>(null);

  useEffect(() => {
    if (!userId || !isOnline) return;
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

            // Trigger native Android overlay if on native platform
            if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
              try {
                const plugin = (window as any)?.Capacitor?.Plugins?.OverlayPlugin;
                if (plugin?.showBookingOverlay) {
                  const bookingJson = JSON.stringify({
                    id: b.id,
                    cust_name: b.cust_name || 'Customer',
                    community: b.community || '',
                    service_type: b.service_type || '',
                    flat_no: b.flat_no || '',
                    price_inr: b.price_inr ?? 0,
                  });
                  console.log('🚀 Triggering native booking overlay from realtime');
                  plugin.showBookingOverlay({ booking: bookingJson });
                } else {
                  console.warn('⚠️ OverlayPlugin.showBookingOverlay not available');
                }
              } catch (err) {
                console.error('❌ Native overlay trigger failed:', err);
              }
            }
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, isOnline, match]);

  const clearAlert = useCallback(() => setPending(null), []);
  const accept = useCallback(async () => {
    if (!pending) return;

    const result = await tryAccept(pending.id, workerId || undefined);
    if (!result.success) {
      toast({ title: result.error || "Booking already taken", variant: "destructive" });
    } else {
      toast({ title: "Booking accepted" });
    }

    setPending(null);
  }, [pending, workerId]);

  const reject = useCallback(async () => {
    if (!pending || !userId) return;
    
    const result = await rejectBooking(pending.id, userId);
    if (result.success) {
      if (result.shouldNotify) {
        toast({ title: "Booking offered to next available workers" });
      } else {
        toast({ title: "Booking rejected" });
      }
    }
    
    setPending(null);
  }, [pending, userId]);

  return { pending, accept, reject, clearAlert };
}
