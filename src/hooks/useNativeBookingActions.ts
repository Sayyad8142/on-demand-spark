import { useEffect, useCallback, useRef } from "react";
import { tryAccept, rejectBooking } from "@/lib/bookingActions";
import { toast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";

/**
 * Hook to listen for booking actions from native Android overlay.
 * 
 * When the Android overlay's Accept/Decline button is pressed,
 * it sends a `native:booking-action` event to the web app.
 * This hook listens for that event and executes the actual
 * Supabase RPC calls (try_accept_booking, reject_booking_request).
 * 
 * This pattern ensures:
 * - No Supabase REST calls from native services (prevents token issues)
 * - All booking actions go through the web app's authenticated session
 * - No token refresh races between native and web
 */
export function useNativeBookingActions(workerId: string | undefined) {
  const processingRef = useRef<Set<string>>(new Set());

  const handleBookingAction = useCallback(async (event: CustomEvent<{ bookingId: string; action: string }>) => {
    const { bookingId, action } = event.detail;
    
    console.log(`[useNativeBookingActions] Received action: ${action} for booking: ${bookingId}`);
    
    if (!bookingId || !workerId) {
      console.warn("[useNativeBookingActions] Missing bookingId or workerId");
      return;
    }

    // Prevent duplicate processing of the same booking action
    const actionKey = `${bookingId}-${action}`;
    if (processingRef.current.has(actionKey)) {
      console.log("[useNativeBookingActions] Action already processing, skipping");
      return;
    }
    processingRef.current.add(actionKey);

    try {
      if (action === "accepted") {
        console.log("[useNativeBookingActions] Processing accept...");
        const result = await tryAccept(bookingId);
        
        if (result.success) {
          console.log("[useNativeBookingActions] ✅ Booking accepted successfully");
          toast({ 
            title: "✅ Booking Accepted!", 
            description: "The booking has been assigned to you."
          });
        } else {
          console.error("[useNativeBookingActions] ❌ Accept failed:", result.error);
          toast({ 
            title: "Booking unavailable", 
            description: result.error || "This booking may have been taken by another worker.",
            variant: "destructive" 
          });
        }
      } else if (action === "declined") {
        console.log("[useNativeBookingActions] Processing decline...");
        const result = await rejectBooking(bookingId, workerId);
        
        if (result.success) {
          console.log("[useNativeBookingActions] ✅ Booking declined successfully");
          if (result.shouldNotify) {
            toast({ 
              title: "Booking passed", 
              description: "Offered to next available workers."
            });
          } else {
            toast({ title: "Booking declined" });
          }
        } else {
          console.error("[useNativeBookingActions] ❌ Decline failed");
          toast({ 
            title: "Could not decline", 
            description: "Please try again.",
            variant: "destructive" 
          });
        }
      } else if (action === "timeout") {
        console.log("[useNativeBookingActions] Booking timed out");
        toast({ 
          title: "Booking expired", 
          description: "The booking offer has timed out."
        });
      } else {
        console.warn("[useNativeBookingActions] Unknown action:", action);
      }
    } catch (error) {
      console.error("[useNativeBookingActions] Error processing action:", error);
      toast({ 
        title: "Error", 
        description: "Something went wrong. Please try again.",
        variant: "destructive" 
      });
    } finally {
      // Allow re-processing after a delay (in case of retry)
      setTimeout(() => {
        processingRef.current.delete(actionKey);
      }, 5000);
    }
  }, [workerId]);

  useEffect(() => {
    // Only set up listener on native platforms
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    console.log("[useNativeBookingActions] Setting up native booking action listener");

    const handler = (event: Event) => {
      handleBookingAction(event as CustomEvent<{ bookingId: string; action: string }>);
    };

    window.addEventListener("native:booking-action", handler);

    return () => {
      console.log("[useNativeBookingActions] Cleaning up native booking action listener");
      window.removeEventListener("native:booking-action", handler);
    };
  }, [handleBookingAction]);
}
