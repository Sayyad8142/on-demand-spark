import { useEffect, useCallback, useRef } from "react";
import { tryAccept, rejectBooking } from "@/lib/bookingActions";
import { toast } from "@/hooks/use-toast";
import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Interface for the native BookingAction plugin.
 */
interface BookingActionPlugin {
  getPendingAction(): Promise<{ bookingId?: string; action?: string; createdAt?: number }>;
  clearPendingAction(): Promise<void>;
}

const BookingAction = registerPlugin<BookingActionPlugin>("BookingAction");

interface BookingActionDetail {
  bookingId: string;
  action: string;
  wasQueued?: boolean;
}

/**
 * Hook to listen for booking actions from native Android overlay.
 * 
 * When the Android overlay's Accept/Decline button is pressed,
 * it sends a `native:booking-action` event to the web app.
 * This hook listens for that event and executes the actual
 * Supabase RPC calls (try_accept_booking, reject_booking_request).
 * 
 * Features:
 * - Queues actions if workerId isn't available yet
 * - Acknowledges processed actions to prevent duplicate processing
 * - Handles race conditions and retries
 * - Never triggers logout on errors
 */
export function useNativeBookingActions(workerId: string | undefined) {
  const processingRef = useRef<Set<string>>(new Set());
  const queuedActionsRef = useRef<BookingActionDetail[]>([]);
  const workerIdRef = useRef<string | undefined>(workerId);

  // Retry bookkeeping for cold-start/session restore issues (accept from overlay)
  const acceptRetryCountRef = useRef<Record<string, number>>({});
  const acceptRetryTimerRef = useRef<Record<string, number>>({});

  // Keep workerIdRef in sync
  useEffect(() => {
    workerIdRef.current = workerId;
    
    // Process any queued actions when workerId becomes available
    if (workerId && queuedActionsRef.current.length > 0) {
      console.log("[useNativeBookingActions] workerId now available, processing queued actions");
      const queue = [...queuedActionsRef.current];
      queuedActionsRef.current = [];
      
      queue.forEach(action => {
        processAction(action);
      });
    }
  }, [workerId]);

  /**
   * Acknowledge a processed action to prevent reprocessing.
   */
  const acknowledgeAction = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
      await BookingAction.clearPendingAction();
      console.log("[useNativeBookingActions] ✓ Action acknowledged and cleared");
    } catch (error) {
      console.warn("[useNativeBookingActions] Failed to acknowledge action:", error);
    }
  }, []);

  /**
   * Process a booking action (accept/decline/timeout).
   */
  const processAction = useCallback(async (detail: BookingActionDetail) => {
    const { bookingId, action, wasQueued } = detail;
    const currentWorkerId = workerIdRef.current;

    const isLikelySessionError = (msg?: string) => {
      const m = (msg || "").toLowerCase();
      return (
        m.includes("session") ||
        m.includes("jwt") ||
        m.includes("invalid") ||
        m.includes("refresh") ||
        m.includes("token") ||
        m.includes("not authenticated") ||
        m.includes("no session")
      );
    };

    const scheduleAcceptRetry = (reason?: string) => {
      const next = (acceptRetryCountRef.current[bookingId] ?? 0) + 1;
      const max = 10;

      if (next > max) {
        console.warn("[useNativeBookingActions] Accept retry limit reached, giving up", {
          bookingId,
          reason,
        });
        delete acceptRetryCountRef.current[bookingId];
        return false;
      }

      acceptRetryCountRef.current[bookingId] = next;

      // Avoid multiple timers for same booking
      const existing = acceptRetryTimerRef.current[bookingId];
      if (existing) {
        window.clearTimeout(existing);
      }

      const waitMs = Math.min(1000 + next * 300, 3000);
      toast({
        title: "Restoring session…",
        description: `Retrying accept (${next}/${max})`,
      });

      // Allow immediate retry by clearing the in-flight marker now
      processingRef.current.delete(`${bookingId}-accepted`);

      acceptRetryTimerRef.current[bookingId] = window.setTimeout(() => {
        processAction({ bookingId, action: "accepted", wasQueued: true });
      }, waitMs);

      return true;
    };

    console.log(
      `[useNativeBookingActions] 🎯 Processing action: ${action} for booking: ${bookingId}${wasQueued ? " (was queued)" : ""}`
    );
    console.log(`[useNativeBookingActions] Current workerId: ${currentWorkerId || "NOT AVAILABLE"}`);

    // For decline, we need workerId
    if (action === "declined" && !currentWorkerId) {
      console.warn("[useNativeBookingActions] workerId not available yet, queueing action");
      queuedActionsRef.current.push(detail);
      toast({
        title: "Processing...",
        description: "Please wait while we process your response.",
      });
      return;
    }

    // For accept, we don't need workerId but we need a valid session
    // Wait longer for session to be restored on cold start
    if (action === "accepted" && wasQueued) {
      console.log("[useNativeBookingActions] ⏳ Waiting for session to stabilize...");
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Increased wait time
    }

    if (!bookingId) {
      console.error("[useNativeBookingActions] Missing bookingId");
      return;
    }

    // Prevent duplicate processing
    const actionKey = `${bookingId}-${action}`;
    if (processingRef.current.has(actionKey)) {
      console.log("[useNativeBookingActions] Action already processing, skipping");
      return;
    }
    processingRef.current.add(actionKey);

    // Show processing toast
    toast({
      title: "Processing booking...",
      description: `${action === "accepted" ? "Accepting" : action === "declined" ? "Declining" : "Processing"} booking from overlay.`,
    });

    try {
      if (action === "accepted") {
        console.log("[useNativeBookingActions] Calling tryAccept...");
        const result = await tryAccept(bookingId);

        if (result.success) {
          console.log("[useNativeBookingActions] ✅ Booking accepted successfully");
          toast({
            title: "✅ Booking Accepted!",
            description: "The booking has been assigned to you.",
          });

          // Clear retry bookkeeping
          delete acceptRetryCountRef.current[bookingId];
          const existing = acceptRetryTimerRef.current[bookingId];
          if (existing) window.clearTimeout(existing);
          delete acceptRetryTimerRef.current[bookingId];

          await acknowledgeAction();
        } else {
          console.error("[useNativeBookingActions] ❌ Accept failed:", result.error);

          // If this looks like a cold-start/session restore issue, do NOT acknowledge.
          // Keep the pending action so we can retry automatically.
          if (isLikelySessionError(result.error) && scheduleAcceptRetry(result.error)) {
            return;
          }

          // Check for specific error types (non-retry / permanent)
          const errorMsg = result.error?.toLowerCase() || "";
          if (errorMsg.includes("already") || errorMsg.includes("taken") || errorMsg.includes("assigned")) {
            toast({
              title: "Booking already taken",
              description: "Another worker accepted this booking first.",
              variant: "destructive",
            });
          } else if (errorMsg.includes("not found") || errorMsg.includes("cancelled")) {
            toast({
              title: "Booking unavailable",
              description: "This booking is no longer available.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Could not accept",
              description: result.error || "Please try again from the app.",
              variant: "destructive",
            });
          }

          // Permanent-ish failure: acknowledge to prevent loops
          delete acceptRetryCountRef.current[bookingId];
          const existing = acceptRetryTimerRef.current[bookingId];
          if (existing) window.clearTimeout(existing);
          delete acceptRetryTimerRef.current[bookingId];

          await acknowledgeAction();
        }
      } else if (action === "declined") {
        console.log("[useNativeBookingActions] Calling rejectBooking...");
        const result = await rejectBooking(bookingId, currentWorkerId!);

        if (result.success) {
          console.log("[useNativeBookingActions] ✅ Booking declined successfully");
          if (result.shouldNotify) {
            toast({
              title: "Booking passed",
              description: "Offered to next available workers.",
            });
          } else {
            toast({ title: "Booking declined" });
          }
          await acknowledgeAction();
        } else {
          console.error("[useNativeBookingActions] ❌ Decline failed");
          toast({
            title: "Could not decline",
            description: "Please try again from the app.",
            variant: "destructive",
          });
          // Still acknowledge - decline failures are usually transient
          await acknowledgeAction();
        }
      } else if (action === "timeout") {
        console.log("[useNativeBookingActions] Booking timed out");
        toast({
          title: "Booking expired",
          description: "The booking offer has timed out.",
        });
        await acknowledgeAction();
      } else {
        console.warn("[useNativeBookingActions] Unknown action:", action);
        await acknowledgeAction();
      }
    } catch (error) {
      console.error("[useNativeBookingActions] Error processing action:", error);

      // For accept, treat unexpected errors during cold start as retryable (best-effort)
      if (action === "accepted") {
        const msg = error instanceof Error ? error.message : String(error);
        if (scheduleAcceptRetry(msg)) {
          return;
        }
      }

      toast({
        title: "Error",
        description: "Something went wrong. Please try again from the app.",
        variant: "destructive",
      });
      // Don't acknowledge on network errors - allow retry
    } finally {
      // Allow re-processing after a delay (in case of retry)
      setTimeout(() => {
        processingRef.current.delete(actionKey);
      }, 2000);
    }
  }, [acknowledgeAction]);

  const handleBookingAction = useCallback((event: CustomEvent<BookingActionDetail>) => {
    const detail = event.detail;
    console.log(`[useNativeBookingActions] 📥 Received native event: ${detail.action} for ${detail.bookingId}`);
    processAction(detail);
  }, [processAction]);

  /**
   * Check for pending actions on mount (for queued actions from cold start).
   */
  const checkPendingActions = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    
    try {
      const pending = await BookingAction.getPendingAction();
      
      if (pending.bookingId && pending.action) {
        console.log("[useNativeBookingActions] 🔍 Found pending action:", pending);
        processAction({
          bookingId: pending.bookingId,
          action: pending.action,
          wasQueued: true,
        });
      }
    } catch (error) {
      console.warn("[useNativeBookingActions] Could not check pending actions:", error);
    }
  }, [processAction]);

  useEffect(() => {
    // Only set up listener on native platforms
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    console.log("[useNativeBookingActions] Setting up native booking action listener");

    const handler = (event: Event) => {
      handleBookingAction(event as CustomEvent<BookingActionDetail>);
    };

    window.addEventListener("native:booking-action", handler);

    // Check for pending actions after a longer delay (give React + Auth more time to mount on cold start)
    const timeoutId = setTimeout(() => {
      checkPendingActions();
    }, 1500); // Increased from 500ms to 1500ms

    return () => {
      console.log("[useNativeBookingActions] Cleaning up native booking action listener");
      window.removeEventListener("native:booking-action", handler);
      clearTimeout(timeoutId);

      // Cleanup any scheduled accept retries
      Object.values(acceptRetryTimerRef.current).forEach((id) => window.clearTimeout(id));
      acceptRetryTimerRef.current = {};
      acceptRetryCountRef.current = {};
    };
  }, [handleBookingAction, checkPendingActions]);
}
