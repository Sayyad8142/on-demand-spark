/**
 * Schedules Android local notifications (bundled female "OTP! OTP! OTP!" clip
 * as channel sound) for the worker's own Start-OTP-pending bookings, and
 * cancels them as soon as the server shows the booking started / cancelled /
 * reassigned / finished. Fire-and-forget: any failure is swallowed and never
 * blocks entering the OTP. Must be rendered inside BrowserRouter.
 */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { LocalNotifications } from "@capacitor/local-notifications";
import { supabase } from "@/integrations/supabase/client";
import { START_ALLOWED_STATUSES } from "@/lib/startOtp";
import {
  START_OTP_REMINDER_CHANNEL,
  START_OTP_REMINDER_KIND,
  START_OTP_REMINDER_SOUND,
  diffReminders,
  planReminders,
  type PlannedReminder,
  type StartOtpReminderBooking,
} from "@/lib/startOtpReminder";

const POLL_MS = 60_000;
const TITLE = "Start OTP Pending";
const BODY = "Please collect and enter the customer's Start OTP.";

async function ensureChannel() {
  await LocalNotifications.createChannel({
    id: START_OTP_REMINDER_CHANNEL,
    name: "Start OTP reminders",
    description: "Reminds you to enter the customer's Start OTP",
    importance: 5,
    visibility: 1,
    sound: START_OTP_REMINDER_SOUND,
    vibration: true,
  });
}

async function pendingReminderIds(): Promise<number[]> {
  const { notifications } = await LocalNotifications.getPending();
  return notifications
    .filter((n: any) => n?.extra?.kind === START_OTP_REMINDER_KIND)
    .map((n) => Number(n.id));
}

async function cancelAllReminders() {
  try {
    const ids = await pendingReminderIds();
    if (ids.length) await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch { /* ignore */ }
}

export default function StartOtpReminderManager({ userId }: { userId: string | undefined }) {
  const navigate = useNavigate();
  const workerIdRef = useRef<string | null>(null);
  const native = Capacitor.isNativePlatform();

  // Tap → that booking's Start OTP screen.
  useEffect(() => {
    if (!native) return;
    const h = LocalNotifications.addListener("localNotificationActionPerformed", (ev) => {
      const extra: any = ev?.notification?.extra;
      if (extra?.kind === START_OTP_REMINDER_KIND && typeof extra.bookingId === "string") {
        navigate(`/start-booking/${extra.bookingId}`);
      }
    });
    return () => { void h.then((x) => x.remove()).catch(() => {}); };
  }, [native, navigate]);

  useEffect(() => {
    if (!native) return;
    if (!userId) { void cancelAllReminders(); return; }
    let cancelled = false;
    let channelReady = false;
    let running = false;

    const resolveWorker = async () => {
      if (workerIdRef.current) return workerIdRef.current;
      let { data } = await supabase.from("workers").select("id").eq("user_id", userId).maybeSingle();
      if (!data) ({ data } = await supabase.from("workers").select("id").eq("id", userId).maybeSingle());
      workerIdRef.current = data?.id ?? null;
      return workerIdRef.current;
    };

    const sync = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        const workerId = await resolveWorker();
        if (!workerId) return;
        const { data, error } = await supabase
          .from("bookings")
          .select("id,status,worker_id,start_otp_required,started_at,accepted_at,assigned_at")
          .eq("worker_id", workerId)
          .in("status", START_ALLOWED_STATUSES as unknown as string[])
          .limit(20);
        // Offline / error: keep the existing schedule untouched.
        if (error || !data || cancelled) return;
        const now = Date.now();
        const wanted: (PlannedReminder & { bookingId: string })[] = [];
        for (const b of data as StartOtpReminderBooking[]) {
          for (const r of planReminders(b, workerId, now)) wanted.push({ ...r, bookingId: b.id });
        }
        const { cancel, schedule } = diffReminders(await pendingReminderIds(), wanted);
        if (cancel.length) await LocalNotifications.cancel({ notifications: cancel.map((id) => ({ id })) });
        if (schedule.length) {
          if (!channelReady) { await ensureChannel(); channelReady = true; }
          await LocalNotifications.schedule({
            notifications: schedule.map((r) => ({
              id: r.id,
              title: TITLE,
              body: BODY,
              channelId: START_OTP_REMINDER_CHANNEL,
              sound: START_OTP_REMINDER_SOUND,
              schedule: { at: new Date(r.at), allowWhileIdle: true },
              autoCancel: true,
              extra: { kind: START_OTP_REMINDER_KIND, bookingId: (r as any).bookingId, index: r.index },
            })),
          });
        }
      } catch (err) {
        console.warn("[START_OTP_REMINDER] sync failed", (err as Error)?.message);
      } finally {
        running = false;
      }
    };

    void sync();
    const interval = window.setInterval(sync, POLL_MS);
    const onEvt = () => { void sync(); };
    window.addEventListener("bookingAccepted", onEvt);
    window.addEventListener("bookingCancelledAlert", onEvt);
    window.addEventListener("startOtpVerified", onEvt);
    const resume = CapApp.addListener("resume", onEvt);

    // Realtime: any change to this worker's bookings re-syncs immediately.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void resolveWorker().then((wid) => {
      if (!wid || cancelled) return;
      channel = supabase
        .channel(`start-otp-reminder-${wid}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `worker_id=eq.${wid}` }, onEvt)
        .subscribe();
    });

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("bookingAccepted", onEvt);
      window.removeEventListener("bookingCancelledAlert", onEvt);
      window.removeEventListener("startOtpVerified", onEvt);
      void resume.then((x) => x.remove()).catch(() => {});
      if (channel) void supabase.removeChannel(channel);
    };
  }, [native, userId]);

  return null;
}
