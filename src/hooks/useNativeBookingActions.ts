import { useEffect, useCallback, useRef, useContext, useState } from "react";
import { tryAccept, rejectBooking } from "@/lib/bookingActions";
import { toast } from "@/hooks/use-toast";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { AuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ensureValidSessionForApiCall } from "@/lib/sessionManager";

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
 * Wait for a valid Supabase session with access_token.
 *
 * IMPORTANT: On native cold start, simply polling getSession() is not enough.
 * We actively attempt to restore the session from storage via ensureValidSessionForApiCall().
 */
async function waitForSessionReady(maxMs: number = 45000): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < maxMs) {
    try {
      // Fast path
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        console.log("[waitForSessionReady] ✅ Session is ready (getSession)");
        return true;
      }

      // Slow path: actively restore from storage if needed
      const restored = await ensureValidSessionForApiCall();
      if (restored) {
        console.log("[waitForSessionReady] ✅ Session is ready (restore)");
        return true;
      }
    } catch (e) {
      console.warn("[waitForSessionReady] Error checking/restoring session:", e);
    }

    console.log(
      `[waitForSessionReady] ⏳ Waiting for session... elapsed=${Date.now() - startTime}ms`
    );
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  console.warn("[waitForSessionReady] ⚠️ Timeout waiting for session");
  return false;
}

/**
 * Hook to listen for booking actions from native Android overlay.
 */
export function useNativeBookingActions(workerId: string | undefined) {
  // Get auth context - may be undefined initially but that's ok
  const authContext = useContext(AuthContext);
  
  // Track auth ready state
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  // Refs for tracking state without causing re-renders
  const processingRef = useRef<Set<string>>(new Set());
  const queuedActionsRef = useRef<BookingActionDetail[]>([]);
  const workerIdRef = useRef<string | undefined>(workerId);
  const acceptRetryCountRef = useRef<Record<string, number>>({});
  const acceptRetryTimerRef = useRef<Record<string, number>>({});
  const deferredActionRef = useRef<BookingActionDetail | null>(null);

  // Update workerIdRef when workerId changes
  useEffect(() => {
    workerIdRef.current = workerId;
  }, [workerId]);

  // Track when auth becomes ready
  useEffect(() => {
    const ready = authContext?.authReady ?? false;
    setIsAuthReady(ready);
    console.log(`[useNativeBookingActions] authReady updated: ${ready}`);
  }, [authContext?.authReady]);

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

    console.log(
      `[useNativeBookingActions] 🎯 Processing action: ${action} for booking: ${bookingId}${wasQueued ? " (was queued)" : ""}`
    );
    console.log(`[useNativeBookingActions] Current workerId: ${currentWorkerId || "NOT AVAILABLE"}`);

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

      const existing = acceptRetryTimerRef.current[bookingId];
      if (existing) {
        window.clearTimeout(existing);
      }

      const waitMs = Math.min(1000 + next * 400, 6000);
      toast({
        title: "Retrying accept…",
        description: `Attempt ${next}/${max}${reason ? ` • ${reason}` : ""}`,
      });

      processingRef.current.delete(`${bookingId}-accepted`);

      acceptRetryTimerRef.current[bookingId] = window.setTimeout(() => {
        processAction({ bookingId, action: "accepted", wasQueued: true });
      }, waitMs);

      return true;
    };

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


    // NOTE: Accept does NOT require workerId (it relies on auth.uid() inside the RPC).
    // On cold start the worker profile can take time to load; don't block accept on that.


    // For accept from cold start OR before authReady, wait for session to be fully ready
    if (action === "accepted" && (wasQueued || !isAuthReady)) {
      console.log(
        "[useNativeBookingActions] ⏳ Cold-start accept: waiting for session to be fully ready..."
      );
      const sessionReady = await waitForSessionReady(45000);

      if (!sessionReady) {
        console.warn(
          "[useNativeBookingActions] ⚠️ Session not ready after waiting, scheduling retry"
        );
        toast({
          title: "Session not ready",
          description: "Please wait a moment and try again.",
          variant: "destructive",
        });
        scheduleAcceptRetry("Session not ready");
        return;
      }
      console.log("[useNativeBookingActions] ✅ Session is ready, proceeding with accept");
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

          window.dispatchEvent(new CustomEvent("bookingAccepted", { detail: { bookingId } }));

          delete acceptRetryCountRef.current[bookingId];
          const existing = acceptRetryTimerRef.current[bookingId];
          if (existing) window.clearTimeout(existing);
          delete acceptRetryTimerRef.current[bookingId];

          await acknowledgeAction();
        } else {
          console.error("[useNativeBookingActions] ❌ Accept failed:", result.error);

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

            delete acceptRetryCountRef.current[bookingId];
            const existing = acceptRetryTimerRef.current[bookingId];
            if (existing) window.clearTimeout(existing);
            delete acceptRetryTimerRef.current[bookingId];

            await acknowledgeAction();
            return;
          }

          console.log("[useNativeBookingActions] Transient error, scheduling retry");
          if (scheduleAcceptRetry(result.error)) {
            return;
          }

          console.warn("[useNativeBookingActions] Retries exhausted for transient error");
          toast({
            title: "Could not accept automatically",
            description: result.error || "Please open the app and accept from the booking screen.",
            variant: "destructive",
          });

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
    } finally {
      setTimeout(() => {
        processingRef.current.delete(actionKey);
      }, 2000);
    }
  }, [acknowledgeAction, isAuthReady]);

  // Process queued actions when workerId becomes available
  useEffect(() => {
    if (workerId && queuedActionsRef.current.length > 0) {
      console.log("[useNativeBookingActions] workerId now available, processing queued actions");
      const queue = [...queuedActionsRef.current];
      queuedActionsRef.current = [];
      
      queue.forEach(action => {
        processAction(action);
      });
    }
  }, [workerId, processAction]);

  // Process deferred actions when auth becomes ready
  useEffect(() => {
    if (isAuthReady && deferredActionRef.current) {
      console.log("[useNativeBookingActions] 🚀 Auth is ready, processing deferred action");
      const action = { ...deferredActionRef.current };
      deferredActionRef.current = null;
      
      setTimeout(() => {
        processAction(action);
      }, 500);
    }
  }, [isAuthReady, processAction]);

  const handleBookingAction = useCallback((event: CustomEvent<BookingActionDetail>) => {
    const detail = event.detail;
    console.log(`[useNativeBookingActions] 📥 Received native event: ${detail.action} for ${detail.bookingId}`);
    
    // If auth is not ready yet:
    // - for ACCEPT: process immediately (processAction will wait for session)
    // - for other actions: defer until authReady
    if (!isAuthReady) {
      if (detail.action === "accepted") {
        console.log("[useNativeBookingActions] ⏳ auth not ready, but accept received — processing with session wait");
        void processAction({ ...detail, wasQueued: detail.wasQueued ?? true });
        return;
      }

      console.log("[useNativeBookingActions] ⛔ auth not ready, deferring action");
      deferredActionRef.current = detail;
      toast({
        title: "Please wait...",
        description: "Initializing app, will process automatically.",
      });
      return;
    }
    
    processAction(detail);
  }, [isAuthReady, processAction]);

  /**
   * Check for pending actions on mount (for queued actions from cold start).
   */
  const checkPendingActions = useCallback(async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;

    try {
      console.log("[useNativeBookingActions] 🔍 Checking for pending actions...");
      const pending = await BookingAction.getPendingAction();

      if (pending.bookingId && pending.action) {
        console.log("[useNativeBookingActions] 🎯 Found pending action:", pending);
        
        // If auth is not ready yet:
        // - for ACCEPT: process immediately (processAction will wait for session)
        // - for other actions: defer until authReady
        if (!isAuthReady) {
          if (pending.action === "accepted") {
            console.log(
              "[useNativeBookingActions] ⏳ auth not ready, but pending accept found — processing with session wait"
            );
            void processAction({
              bookingId: pending.bookingId,
              action: pending.action,
              wasQueued: true,
            });
            return true;
          }

          console.log("[useNativeBookingActions] ⛔ auth not ready, deferring pending action");
          deferredActionRef.current = {
            bookingId: pending.bookingId,
            action: pending.action,
            wasQueued: true,
          };
          toast({
            title: "Please wait...",
            description: "Initializing app, will process automatically.",
          });
          return true;
        }
        
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
  }, [isAuthReady, processAction]);

  // Set up native event listener and polling
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    console.log("[useNativeBookingActions] Setting up native booking action listener");

    const handler = (event: Event) => {
      handleBookingAction(event as CustomEvent<BookingActionDetail>);
    };

    window.addEventListener("native:booking-action", handler);

    let cancelled = false;
    let pollTimeoutId: number | null = null;
    let attempts = 0;
    const maxAttempts = 40;

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
          const nextDelay = attempts < 10 ? 1000 : attempts < 20 ? 1500 : 2000;
          poll(nextDelay);
        }
      }, delayMs);
    };

    poll(800);

    return () => {
      cancelled = true;
      console.log("[useNativeBookingActions] Cleaning up native booking action listener");
      window.removeEventListener("native:booking-action", handler);
      if (pollTimeoutId) window.clearTimeout(pollTimeoutId);

      Object.values(acceptRetryTimerRef.current).forEach((id) => window.clearTimeout(id));
      acceptRetryTimerRef.current = {};
      acceptRetryCountRef.current = {};
    };
  }, [handleBookingAction, checkPendingActions]);
}
