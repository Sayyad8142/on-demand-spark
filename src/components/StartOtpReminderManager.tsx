/** Native owns timing/audio; React supplies lifecycle wakeups, never OTP values. */
import { useEffect } from "react";
import { App as CapApp } from "@capacitor/app";
import { LocalNotifications } from "@capacitor/local-notifications";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/config/env";
import { hasStartOtpAlarm, StartOtpAlarm } from "@/native/startOtpAlarm";

let generationCounter = 0;
export default function StartOtpReminderManager({ userId }: { userId: string | undefined }) {
  useEffect(() => {
    if (!hasStartOtpAlarm()) return;
    const generation = ++generationCounter;
    let cancelled = false;
    let running = false;
    let queued = false;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    const initialize = async () => {
      // Remove old Capacitor alarms so the restore receiver cannot replay them.
      const pending = await LocalNotifications.getPending().catch(() => ({ notifications: [] }));
      const old = pending.notifications.filter(n => n.extra?.kind === "start_otp_reminder");
      if (old.length) await LocalNotifications.cancel({ notifications: old.map(n => ({ id: n.id })) });
      if (cancelled) return;
      await StartOtpAlarm.configure({ userId: userId ?? "", generation, url: getSupabaseUrl(), key: getSupabaseAnonKey() });
      if (!userId) return;
      await StartOtpAlarm.reconcile();
      const { data } = await supabase.from("workers").select("id").eq("user_id", userId).maybeSingle();
      if (cancelled || !data) return;
      channel = supabase.channel(`start-alarm-${data.id}-${generation}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `worker_id=eq.${data.id}` }, payload => {
          const row = payload.new as { id?: string; worker_id?: string; started_at?: string | null; status?: string };
          if (row.id && (row.started_at || row.worker_id !== data.id || !["assigned", "accepted", "on_the_way"].includes(row.status ?? ""))) {
            void StartOtpAlarm.cancel({ bookingId: row.id }).catch(() => {});
          }
          void sync();
        })
        .subscribe();
    };
    const sync = async () => {
      if (cancelled || !userId) return;
      if (running) { queued = true; return; }
      running = true;
      try {
        do {
          queued = false;
          await StartOtpAlarm.sync({ userId, generation, workerId: "", bookings: [] });
        } while (queued && !cancelled);
      } catch { /* native retains locally eligible state on offline reads */ }
      finally { running = false; }
    };
    const onStop = (event: Event) => {
      const id = (event as CustomEvent<{ bookingId?: string }>).detail?.bookingId;
      if (id) void StartOtpAlarm.cancel({ bookingId: id }).catch(() => {});
      void sync();
    };
    const onChange = () => { window.dispatchEvent(new Event("startOtpAlarmPending")); void sync(); };
    const stops = ["startOtpVerified", "bookingStarted", "bookingCancelledAlert", "bookingCompleted", "bookingReassigned"];
    stops.forEach(name => window.addEventListener(name, onStop));
    window.addEventListener("bookingAccepted", onChange);
    window.addEventListener("online", onChange);
    const resume = CapApp.addListener("resume", onChange);
    void initialize().catch(() => {});
    return () => {
      cancelled = true;
      stops.forEach(name => window.removeEventListener(name, onStop));
      window.removeEventListener("bookingAccepted", onChange);
      window.removeEventListener("online", onChange);
      void resume.then(h => h.remove()).catch(() => {});
      if (channel) void supabase.removeChannel(channel);
      // Unmount/account transition invalidates pending native reads. Next configure starts fresh.
      void StartOtpAlarm.stopAll().catch(() => {});
    };
  }, [userId]);
  return null;
}
