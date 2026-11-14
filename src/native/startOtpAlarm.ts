import { Capacitor, registerPlugin } from "@capacitor/core";
import type { StartOtpReminderBooking } from "@/lib/startOtpReminder";

type AlarmBridge = {
  configure(input: { userId: string; generation: number; url: string; key: string }): Promise<void>;
  sync(input: { userId: string; generation: number; workerId: string; bookings: StartOtpReminderBooking[] }): Promise<void>;
  stopAll(): Promise<void>;
  cancel(input: { bookingId: string }): Promise<void>;
  reconcile(): Promise<void>;
};
export const StartOtpAlarm = registerPlugin<AlarmBridge>("StartOtpAlarm");
export const hasStartOtpAlarm = () => Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("StartOtpAlarm");