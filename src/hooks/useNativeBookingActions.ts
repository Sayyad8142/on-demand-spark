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

    /**
     * Detect errors that indicate session/auth is not ready - these are RETRYABLE.
     */
    const isTransientSessionOrNetworkError = (msg?: string) => {
      const m = (msg || "").toLowerCase();
      return (
        m.includes("session") ||
        m.includes("jwt") ||
        m.includes("invalid") ||
        m.includes("refresh") ||
        m.includes("token") ||
        m.includes("not authenticated") ||
        m.includes("no session") ||
        m.includes("unauthorized") ||
        m.includes("not authorized") ||
        m.includes("forbidden") ||
        m.includes("permission denied") ||
        m.includes("rls") ||
        m.includes("status 401") ||
        m.includes("status 403") ||
        // Network errors - also retryable
        m.includes("failed to fetch") ||
        m.includes("network") ||
        m.includes("timeout") ||
        m.includes("connection") ||
        m.includes("econnrefused") ||
        m.includes("abort") ||
        m.includes("offline") ||
        m.includes("status 0") ||
        m.includes("status 502") ||
        m.includes("status 503") ||
        m.includes("status 504")
      );
    };

    /**
     * Detect TERMINAL errors - booking is no longer actionable, stop retrying.
     */
    const isTerminalAcceptError = (msg?: string) => {
      const m = (msg || "").toLowerCase();
      return (
        m.includes("already taken") ||
        m.includes("already assigned") ||
        m.includes("booking already") ||
        m.includes("not found") ||
        m.includes("cancelled") ||
        m.includes("canceled") ||
        m.includes("expired") ||
        m.includes("no longer available") ||
        m.includes("does not exist")
      );
    };

    const scheduleAcceptRetry = (reason?: string) => {
      const next = (acceptRetryCountRef.current[bookingId] ?? 0) + 1;
      // Accept-from-overlay can require a long cold-start + session restore.
      // Keep retrying for longer before giving up.
      const max = 30;

      if (next > max) {
        console.warn("[useNativeBookingActions] Accept retry limit reached, giving up", {
          bookingId,
          reason,
        });

        delete acceptRetryCountRef.current[bookingId];
        const existing = acceptRetryTimerRef.current[bookingId];
        if (existing) window.clearTimeout(existing);
        delete acceptRetryTimerRef.current[bookingId];

        return false;
      }

      acceptRetryCountRef.current[bookingId] = next;

      // Avoid multiple timers for same booking
      const existing = acceptRetryTimerRef.current[bookingId];
      if (existing) {
        window.clearTimeout(existing);
      }

      const waitMs = Math.min(1000 + next * 400, 6000);
      toast({
        title: "Retrying accept…",
        description: `Attempt ${next}/${max}${reason ? ` • ${reason}` : ""}`,
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
    // Wait longer for session to be restored on cold start (wasQueued = true means from overlay/cold start)
    if (action === "accepted" && wasQueued) {
      // First attempt waits 2.5s, retries wait less since session should be more stable
      const isFirstAttempt = (acceptRetryCountRef.current[bookingId] ?? 0) === 0;
      const waitMs = isFirstAttempt ? 2500 : 1000;
      console.log(`[useNativeBookingActions] ⏳ Waiting ${waitMs}ms for session to stabilize (first attempt: ${isFirstAttempt})...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
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

          // Notify the UI to refetch/show the active job immediately
          window.dispatchEvent(new CustomEvent("bookingAccepted", { detail: { bookingId } }));

          // Clear retry bookkeeping
          delete acceptRetryCountRef.current[bookingId];
          const existing = acceptRetryTimerRef.current[bookingId];
          if (existing) window.clearTimeout(existing);
          delete acceptRetryTimerRef.current[bookingId];

          await acknowledgeAction();
        } else {
          console.error("[useNativeBookingActions] ❌ Accept failed:", result.error);

          // Check if this is a TERMINAL error (booking gone, already taken, etc.)
          // Only clear pending action for terminal errors.
          if (isTerminalAcceptError(result.error)) {
            console.log("[useNativeBookingActions] Terminal error detected, clearing pending action");
            
            const errorMsg = result.error?.toLowerCase() || "";
            if (errorMsg.includes("already") || errorMsg.includes("taken") || errorMsg.includes("assigned")) {
              toast({
                title: "Booking already taken",
                description: "Another worker accepted this booking first.",
                variant: "destructive",
              });
            } else {
              toast({
                title: "Booking unavailable",
                description: "This booking is no longer available.",
                variant: "destructive",
              });
            }

            // Stop retry bookkeeping and clear pending action
            delete acceptRetryCountRef.current[bookingId];
            const existing = acceptRetryTimerRef.current[bookingId];
            if (existing) window.clearTimeout(existing);
            delete acceptRetryTimerRef.current[bookingId];

            await acknowledgeAction();
            return;
          }

          // NOT a terminal error - likely transient (session, network, etc.)
          // DO NOT clear pending action - retry instead
          console.log("[useNativeBookingActions] Transient error, scheduling retry (keeping pending action)");
          if (scheduleAcceptRetry(result.error)) {
            // Retry scheduled, DO NOT acknowledgeAction()
            return;
          }

          // Retries exhausted but not a terminal error - still clear to prevent infinite loop
          console.warn("[useNativeBookingActions] Retries exhausted for transient error");
          toast({
            title: "Could not accept automatically",
            description: result.error || "Please open the app and accept from the booking screen.",
            variant: "destructive",
          });

          // Stop retry bookkeeping
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

      if (action === "accepted") {
        const msg = error instanceof Error ? error.message : String(error);
        const scheduled = scheduleAcceptRetry(msg);
        if (scheduled) {
          return;
        }

        // Retries exhausted: clear the pending action to avoid a loop.
        toast({
          title: "Could not accept automatically",
          description: "Please open the app and accept from the booking screen.",
          variant: "destructive",
        });
        await acknowledgeAction();
        return;
      }

      toast({
        title: "Error",
        description: "Something went wrong. Please try again from the app.",
        variant: "destructive",
      });
      // Non-accept actions can be acknowledged normally by their own branches.
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
   *
   * IMPORTANT: On some devices WebView/Capacitor bridge initialization is slow,
   * so we retry for a short window instead of checking only once.
   */
  const checkPendingActions = useCallback(async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;

    try {
      console.log("[useNativeBookingActions] 🔍 Checking for pending actions...");
      const pending = await BookingAction.getPendingAction();

      if (pending.bookingId && pending.action) {
        console.log("[useNativeBookingActions] 🎯 Found pending action:", pending);
        // Fire and forget: processAction has its own duplicate guards.
        void processAction({
          bookingId: pending.bookingId,
          action: pending.action,
          wasQueued: true,
        });
        return true;
      } else {
        console.log("[useNativeBookingActions] No pending action found");
      }
    } catch (error) {
      console.warn("[useNativeBookingActions] Could not check pending actions:", error);
    }

    return false;
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

    // Poll for pending actions for a longer time window.
    // This fixes cases where the first check happens before the native bridge is ready.
    let cancelled = false;
    let pollTimeoutId: number | null = null;
    let attempts = 0;
    const maxAttempts = 40; // ~60s total with varying delays

    const poll = (delayMs: number) => {
      pollTimeoutId = window.setTimeout(async () => {
        if (cancelled) return;

        attempts++;
        console.log(`[useNativeBookingActions] Polling for pending action (attempt ${attempts}/${maxAttempts})`);
        const found = await checkPendingActions();
        if (found) {
          console.log("[useNativeBookingActions] ✅ Pending action found and processed");
          return;
        }

        if (attempts < maxAttempts) {
          // Faster polling initially, slower later
          const nextDelay = attempts < 10 ? 1000 : attempts < 20 ? 1500 : 2000;
          poll(nextDelay);
        }
      }, delayMs);
    };

    // Give React/Auth a moment, then start polling
    poll(800);

    return () => {
      cancelled = true;
      console.log("[useNativeBookingActions] Cleaning up native booking action listener");
      window.removeEventListener("native:booking-action", handler);
      if (pollTimeoutId) window.clearTimeout(pollTimeoutId);

      // Cleanup any scheduled accept retries
      Object.values(acceptRetryTimerRef.current).forEach((id) => window.clearTimeout(id));
      acceptRetryTimerRef.current = {};
      acceptRetryCountRef.current = {};
    };
  }, [handleBookingAction, checkPendingActions]);
}
