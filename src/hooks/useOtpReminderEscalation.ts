
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { playOtpReminderVoice, stopOtpReminderVoice } from "@/lib/otpReminderVoice";

const REMINDER_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const ELAPSED_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes
const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds

interface OtpReminderState {
  firstTriggeredAt: number;
  lastShownAt: number;
  acknowledgedCount: number;
}

export function useOtpReminderEscalation(
  userId: string | undefined,
  workerId: string | undefined | null
) {
  const [activeReminder, setActiveReminder] = useState<{
    bookingId: string;
    flatNo: string;
  } | null>(null);
  
  const pollTimerRef = useRef<number | null>(null);

  const checkEscalation = useCallback(async () => {
    if (!workerId) return;

    try {
      const { data: bookings, error } = await supabase
        .from("bookings")
        .select("id, flat_no, accepted_at, status, otp_verified")
        .eq("worker_id", workerId)
        .in("status", ["accepted", "confirmed", "on_the_way", "started", "in_progress"])
        .eq("otp_verified", false)
        .not("accepted_at", "is", null);

      if (error || !bookings || bookings.length === 0) {
        if (activeReminder) {
          setActiveReminder(null);
          stopOtpReminderVoice();
        }
        return;
      }

      const now = Date.now();

      for (const booking of bookings) {
        const acceptedAt = new Date(booking.accepted_at!).getTime();
        const elapsed = now - acceptedAt;

        if (elapsed < ELAPSED_THRESHOLD_MS) continue;

        const stateKey = `otp_reminder:${booking.id}`;
        const rawState = localStorage.getItem(stateKey);
        const state: OtpReminderState = rawState 
          ? JSON.parse(rawState) 
          : { firstTriggeredAt: 0, lastShownAt: 0, acknowledgedCount: 0 };

        const shouldShow = state.lastShownAt === 0 || (now - state.lastShownAt >= REMINDER_INTERVAL_MS);

        if (shouldShow) {
          console.log(`⚠ OTP Reminder Triggered for ${booking.id}`);
          
          if (state.firstTriggeredAt === 0) {
            state.firstTriggeredAt = now;
            await supabase.rpc("log_otp_reminder_event", {
              p_booking_id: booking.id,
              p_event_type: "otp_reminder_triggered",
              p_metadata: { elapsed_min: Math.floor(elapsed / 60000) }
            });
          } else {
            await supabase.rpc("log_otp_reminder_event", {
              p_booking_id: booking.id,
              p_event_type: "otp_reminder_repeated",
              p_metadata: { 
                elapsed_min: Math.floor(elapsed / 60000),
                prev_shown_at: new Date(state.lastShownAt).toISOString()
              }
            });
          }

          state.lastShownAt = now;
          localStorage.setItem(stateKey, JSON.stringify(state));

          setActiveReminder({
            bookingId: booking.id,
            flatNo: booking.flat_no || "N/A"
          });

          // Play voice and vibrate
          playOtpReminderVoice();
          if (navigator.vibrate) {
            navigator.vibrate([500, 200, 500, 200, 500]);
          }
          
          // Only show one at a time
          break;
        }
      }
    } catch (e) {
      console.warn("OTP Escalation check failed:", e);
    }
  }, [workerId, activeReminder]);

  useEffect(() => {
    if (!userId || !workerId) {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    checkEscalation();
    pollTimerRef.current = window.setInterval(checkEscalation, POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
      }
    };
  }, [userId, workerId, checkEscalation]);

  const acknowledge = useCallback(async (bookingId: string, metadata: any = {}) => {
    setActiveReminder(null);
    stopOtpReminderVoice();
    
    const stateKey = `otp_reminder:${bookingId}`;
    const rawState = localStorage.getItem(stateKey);
    if (rawState) {
      const state: OtpReminderState = JSON.parse(rawState);
      state.acknowledgedCount++;
      localStorage.setItem(stateKey, JSON.stringify(state));
    }

    await supabase.rpc("log_otp_reminder_event", {
      p_booking_id: bookingId,
      p_event_type: "otp_reminder_acknowledged",
      p_metadata: metadata
    });
  }, []);

  return { activeReminder, acknowledge };
}
