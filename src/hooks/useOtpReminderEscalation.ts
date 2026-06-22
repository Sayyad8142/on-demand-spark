/**
 * OTP completion reminder escalation.
 *
 * Watches the worker's active bookings and, when a booking has been accepted
 * for >= 60 minutes without the customer OTP being entered, dispatches an
 * `otpReminderAlert` window event so App.tsx can render the full-screen alert.
 *
 * Repeats every 10 minutes until the OTP is entered or the booking leaves an
 * active status. Per-booking state is persisted to localStorage so the cadence
 * survives reloads.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const ACTIVE_STATUSES = [
  "accepted",
  "confirmed",
  "on_the_way",
  "started",
  "in_progress",
];

const FIRST_DELAY_MS = 60 * 60 * 1000; // 60 minutes
const REPEAT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds
const STORAGE_PREFIX = "otp_reminder:";

type ReminderState = {
  firstTriggeredAt?: number;
  lastShownAt?: number;
  count?: number;
};

function loadState(bookingId: string): ReminderState {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + bookingId);
    return raw ? (JSON.parse(raw) as ReminderState) : {};
  } catch {
    return {};
  }
}

function saveState(bookingId: string, state: ReminderState) {
  try {
    localStorage.setItem(STORAGE_PREFIX + bookingId, JSON.stringify(state));
  } catch {
    /* no-op */
  }
}

function clearState(bookingId: string) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + bookingId);
  } catch {
    /* no-op */
  }
}

async function logEvent(bookingId: string, eventType: string, metadata: Record<string, unknown> = {}) {
  try {
    await supabase.rpc("log_otp_reminder_event" as any, {
      p_booking_id: bookingId,
      p_event_type: eventType,
      p_metadata: metadata as any,
    });
  } catch (err) {
    console.warn("[OTP_REMINDER] log event failed", eventType, err);
  }
}

export function useOtpReminderEscalation(userId: string | undefined) {
  const workerIdRef = useRef<string | null>(null);
  const previouslyOtpVerifiedRef = useRef<Set<string>>(new Set());

  // Resolve worker id once per user.
  useEffect(() => {
    let cancelled = false;
    workerIdRef.current = null;
    if (!userId) return;

    (async () => {
      try {
        let { data } = await supabase
          .from("workers")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        if (!data) {
          const { data: legacy } = await supabase
            .from("workers")
            .select("id")
            .eq("id", userId)
            .maybeSingle();
          data = legacy;
        }
        if (!cancelled) workerIdRef.current = data?.id ?? null;
      } catch (err) {
        console.warn("[OTP_REMINDER] resolve worker failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const check = async () => {
      const workerId = workerIdRef.current;
      if (!workerId) return;

      try {
        const { data, error } = await supabase
          .from("bookings")
          .select("id, status, accepted_at, otp_verified_at")
          .eq("worker_id", workerId)
          .in("status", ACTIVE_STATUSES)
          .limit(20);

        if (error) {
          console.warn("[OTP_REMINDER] poll failed", error);
          return;
        }
        if (cancelled || !data) return;

        const now = Date.now();
        const activeIds = new Set<string>();

        for (const b of data) {
          activeIds.add(b.id);
          const accepted = b.accepted_at ? new Date(b.accepted_at).getTime() : 0;
          if (!accepted) continue;

          // OTP already entered: log first-time transition and clean up state.
          if (b.otp_verified_at) {
            const had = loadState(b.id).firstTriggeredAt;
            if (had && !previouslyOtpVerifiedRef.current.has(b.id)) {
              previouslyOtpVerifiedRef.current.add(b.id);
              void logEvent(b.id, "otp_entered_after_reminder", {
                first_triggered_at: new Date(had).toISOString(),
                otp_verified_at: b.otp_verified_at,
              });
            }
            clearState(b.id);
            continue;
          }

          if (now - accepted < FIRST_DELAY_MS) continue;

          const state = loadState(b.id);
          const lastShown = state.lastShownAt ?? 0;
          const elapsedSinceLast = now - lastShown;
          const isFirst = !state.firstTriggeredAt;

          if (!isFirst && elapsedSinceLast < REPEAT_INTERVAL_MS) continue;

          const nextCount = (state.count ?? 0) + 1;
          const nextState: ReminderState = {
            firstTriggeredAt: state.firstTriggeredAt ?? now,
            lastShownAt: now,
            count: nextCount,
          };
          saveState(b.id, nextState);

          void logEvent(
            b.id,
            isFirst ? "otp_reminder_triggered" : "otp_reminder_repeated",
            { count: nextCount, accepted_at: b.accepted_at }
          );

          window.dispatchEvent(
            new CustomEvent("otpReminderAlert", {
              detail: { bookingId: b.id, count: nextCount },
            })
          );
        }

        // Clean up storage for bookings no longer active.
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith(STORAGE_PREFIX)) continue;
            const bid = key.slice(STORAGE_PREFIX.length);
            if (!activeIds.has(bid)) {
              localStorage.removeItem(key);
              i--;
            }
          }
        } catch {
          /* no-op */
        }
      } catch (err) {
        console.warn("[OTP_REMINDER] check failed", err);
      }
    };

    // Run once shortly after mount, then on an interval.
    const initial = window.setTimeout(check, 5000);
    const interval = window.setInterval(check, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [userId]);
}

export { logEvent as logOtpReminderEvent };
