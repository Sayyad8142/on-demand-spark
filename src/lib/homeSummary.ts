/**
 * Display-only Home screen rules. Reads server values only; never changes
 * availability, dispatch, priority, ratings or payouts.
 */
import { computePayoutTotals, istDayKey, mapPayoutStatus, type TotalsInput } from "@/lib/payoutDisplay";
import type { GuideLang } from "@/lib/availabilityVoice";

export type AvailabilityView = "off" | "ready" | "on_not_ready";

/** "Ready for Bookings" only when the server says ON and nothing blocks offers. */
export function availabilityView(i: {
  isAvailable: boolean;
  payoutReady: boolean;
  pushHealthy: boolean;
  hasSlots: boolean;
}): AvailabilityView {
  if (!i.isAvailable) return "off";
  return i.payoutReady && i.pushHealthy && i.hasSlots ? "ready" : "on_not_ready";
}

export const AVAILABILITY_VIEW_TEXT: Record<AvailabilityView, { heading: string; description: string }> = {
  off: { heading: "Not Taking Bookings", description: "Turn ON to receive bookings" },
  ready: { heading: "Ready for Bookings", description: "You can receive new bookings" },
  on_not_ready: { heading: "ON - Not Ready Yet", description: "Finish the steps below to get bookings" },
};

/** Earned today = server payout records created today (IST), failed/reversed excluded. Paid today = bank-confirmed today. */
export function todayMoney(rows: TotalsInput[], now: Date = new Date()): { earned: number; paid: number } {
  const earned = computePayoutTotals(rows, now).today;
  const todayKey = istDayKey(now);
  let paid = 0;
  for (const r of rows) {
    if (r.isEstimate || mapPayoutStatus(r.status, r.paid_at) !== "paid" || !r.paid_at) continue;
    if (istDayKey(r.paid_at) === todayKey) paid += Math.max(0, Number(r.payout_amount) || 0);
  }
  return { earned, paid };
}

export function countCompletedToday(rows: { status: string | null; completed_at: string | null }[], now: Date = new Date()): number {
  const key = istDayKey(now);
  return rows.filter((r) => r.status === "completed" && r.completed_at && istDayKey(r.completed_at) === key).length;
}

/** Statuses that mean the booking is assigned to this worker (pending is not confirmed). */
const CONFIRMED = new Set(["assigned", "confirmed", "accepted"]);

export interface UpcomingRow {
  booking_id: string;
  status: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  community?: string | null;
  service_type?: string | null;
}

export function confirmedUpcoming<T extends UpcomingRow>(rows: T[]): T[] {
  return rows
    .filter((r) => CONFIRMED.has(String(r.status).toLowerCase()))
    .sort((a, b) => `${a.scheduled_date ?? "9999"} ${a.scheduled_time ?? "99"}`.localeCompare(`${b.scheduled_date ?? "9999"} ${b.scheduled_time ?? "99"}`));
}

export const HOME_AVAILABILITY_GUIDE: Record<GuideLang, string> = {
  en: "This switch controls your bookings. Green means ON, you can receive new bookings. Red means OFF, you will not get bookings. Tap the switch to change it.",
  hi: "यह बटन आपकी बुकिंग चालू या बंद करता है। हरा मतलब चालू, आपको नई बुकिंग मिल सकती है। लाल मतलब बंद, आपको बुकिंग नहीं मिलेगी। बदलने के लिए बटन दबाएं।",
  te: "ఈ బటన్ మీ బుకింగ్‌లను ఆన్ లేదా ఆఫ్ చేస్తుంది. ఆకుపచ్చ అంటే ఆన్, మీకు కొత్త బుకింగ్‌లు వస్తాయి. ఎరుపు అంటే ఆఫ్, మీకు బుకింగ్‌లు రావు. మార్చడానికి బటన్ నొక్కండి.",
};
