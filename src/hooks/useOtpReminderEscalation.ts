
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { playOtpReminderVoice, stopOtpReminderVoice } from "@/lib/otpReminderVoice";

const REMINDER_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const ELAPSED_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes
const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds

export interface OtpPendingBooking {
  id: string;
  flat_no: string | null;
  accepted_at: string | null;
}

interface OtpReminderState {
  firstTriggeredAt: number;
  lastShownAt: number;
  acknowledgedCount: number;
}

export async function logOtpReminderEvent(
  bookingId: string,
  eventType: 'otp_reminder_triggered' | 'otp_reminder_acknowledged' | 'otp_reminder_repeated' | 'otp_entered_after_reminder',
  metadata: any = {}
) {
  try {
    const { error } = await supabase.rpc("log_otp_reminder_event" as any, {
      p_booking_id: bookingId,
      p_event_type: eventType,
      p_metadata: metadata
    });
    if (error) console.warn("Failed to log OTP reminder event:", error.message);
  } catch (e) {
    console.warn("logOtpReminderEvent error:", e);
  }
}

export function useOtpReminderEscalation(
  userId: string | undefined
) {
  const [activeReminder, setActiveReminder] = useState<{
    bookingId: string;
    flatNo: string;
    count: number;
  } | null>(null);
  
  const [pendingBookings, setPendingBookings] = useState<OtpPendingBooking[]>([]);
  const pollTimerRef = useRef<number | null>(null);

  const checkEscalation = useCallback(async () => {
    if (!userId) return;

    try {
      // Get worker profile first to get internal ID
      const { data: worker } = await supabase
        .from('workers')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!worker) return;

      const { data: bookings, error } = await supabase
        .from("bookings")
        .select("id, flat_no, accepted_at, status, otp_verified_at")
        .eq("worker_id", worker.id)
        .in("status", ["accepted", "confirmed", "on_the_way", "started", "in_progress"])
        .is("otp_verified_at", null)
        .not("accepted_at", "is", null);

      if (error || !bookings) {
        setPendingBookings([]);
        if (activeReminder) {
          setActiveReminder(null);
          stopOtpReminderVoice();
        }
        return;
      }

      const now = Date.now();
      const overdueBookings: OtpPendingBooking[] = [];

      for (const booking of (bookings as any[])) {
        const acceptedAt = new Date(booking.accepted_at as string).getTime();
        const elapsed = now - acceptedAt;

        if (elapsed >= ELAPSED_THRESHOLD_MS) {
          overdueBookings.push({
            id: booking.id,
            flat_no: booking.flat_no,
            accepted_at: booking.accepted_at
          });

          const stateKey = `otp_reminder:${booking.id}`;
          const rawState = localStorage.getItem(stateKey);
          const state: OtpReminderState = rawState 
            ? JSON.parse(rawState) 
            : { firstTriggeredAt: 0, lastShownAt: 0, acknowledgedCount: 0 };

          const shouldShow = state.lastShownAt === 0 || (now - state.lastShownAt >= REMINDER_INTERVAL_MS);

          if (shouldShow && !activeReminder) {
            console.log(`⚠ OTP Reminder Triggered for ${booking.id}`);
            
            const isFirst = state.firstTriggeredAt === 0;
            if (isFirst) {
              state.firstTriggeredAt = now;
              void logOtpReminderEvent(booking.id, "otp_reminder_triggered", { 
                elapsed_min: Math.floor(elapsed / 60000) 
              });
            } else {
              void logOtpReminderEvent(booking.id, "otp_reminder_repeated", { 
                elapsed_min: Math.floor(elapsed / 60000),
                prev_shown_at: new Date(state.lastShownAt).toISOString()
              });
            }

            state.lastShownAt = now;
            localStorage.setItem(stateKey, JSON.stringify(state));

            setActiveReminder({
              bookingId: booking.id,
              flatNo: (booking as any).flat_no || "N/A",
              count: state.acknowledgedCount + 1
            });

            // Emit window event for App.tsx to pick up
            window.dispatchEvent(new CustomEvent("otpReminderAlert", {
              detail: { 
                bookingId: booking.id,
                count: state.acknowledgedCount + 1
              }
            }));
          }
        }
      }
      
      setPendingBookings(overdueBookings);
    } catch (e) {
      console.warn("OTP Escalation check failed:", e);
    }
  }, [userId, activeReminder]);

  useEffect(() => {
    if (!userId) {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setPendingBookings([]);
      return;
    }

    checkEscalation();
    pollTimerRef.current = window.setInterval(checkEscalation, POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
      }
    };
  }, [userId, checkEscalation]);

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

    void logOtpReminderEvent(bookingId, "otp_reminder_acknowledged", metadata);
  }, []);

  return { activeReminder, pendingBookings, acknowledge };
}
