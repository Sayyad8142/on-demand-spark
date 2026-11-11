import { describe, it, expect } from "vitest";
import { availabilityView, todayMoney, countCompletedToday, confirmedUpcoming, HOME_AVAILABILITY_GUIDE, AVAILABILITY_VIEW_TEXT } from "@/lib/homeSummary";
import en from "@/i18n/locales/en.json";
import hi from "@/i18n/locales/hi.json";
import te from "@/i18n/locales/te.json";

const ok = { payoutReady: true, pushHealthy: true, hasSlots: true };
const now = new Date("2026-11-11T06:00:00Z"); // 11:30 IST

describe("home availability wording", () => {
  it("OFF shows Not Taking Bookings", () => {
    expect(availabilityView({ isAvailable: false, ...ok })).toBe("off");
    expect(AVAILABILITY_VIEW_TEXT.off.heading).toBe("Not Taking Bookings");
  });
  it("ON and eligible shows Ready for Bookings", () => {
    expect(availabilityView({ isAvailable: true, ...ok })).toBe("ready");
    expect(AVAILABILITY_VIEW_TEXT.ready.heading).toBe("Ready for Bookings");
  });
  it("never shows Ready when the worker can't get offers", () => {
    expect(availabilityView({ isAvailable: true, ...ok, payoutReady: false })).toBe("on_not_ready");
    expect(availabilityView({ isAvailable: true, ...ok, pushHealthy: false })).toBe("on_not_ready");
    expect(availabilityView({ isAvailable: true, ...ok, hasSlots: false })).toBe("on_not_ready");
  });
});

describe("today's numbers", () => {
  it("earned excludes failed and estimates; paid needs paid_at today", () => {
    const rows = [
      { status: "paid", paid_at: "2026-11-11T05:00:00Z", payout_amount: 300, created_at: "2026-11-11T04:00:00Z" },
      { status: "pending", paid_at: null, payout_amount: 200, created_at: "2026-11-11T03:00:00Z" },
      { status: "failed", paid_at: null, payout_amount: 999, created_at: "2026-11-11T03:00:00Z" },
      { status: "paid", paid_at: "2026-11-10T05:00:00Z", payout_amount: 50, created_at: "2026-11-10T04:00:00Z" },
      { status: null, paid_at: null, payout_amount: 400, created_at: "2026-11-11T03:00:00Z", isEstimate: true },
    ];
    expect(todayMoney(rows, now)).toEqual({ earned: 500, paid: 300 });
    expect(todayMoney([], now)).toEqual({ earned: 0, paid: 0 });
  });
  it("counts jobs completed on the IST day", () => {
    expect(countCompletedToday([
      { status: "completed", completed_at: "2026-11-10T19:00:00Z" }, // 00:30 IST 11 Nov
      { status: "completed", completed_at: "2026-11-10T18:00:00Z" }, // 23:30 IST 10 Nov
      { status: "cancelled", completed_at: "2026-11-11T02:00:00Z" },
    ], now)).toBe(1);
  });
  it("next booking skips pending and sorts by time", () => {
    const r = confirmedUpcoming([
      { booking_id: "a", status: "pending", scheduled_date: "2026-11-11", scheduled_time: "09:00" },
      { booking_id: "b", status: "assigned", scheduled_date: "2026-11-12", scheduled_time: "08:00" },
      { booking_id: "c", status: "confirmed", scheduled_date: "2026-11-11", scheduled_time: "15:00" },
    ]);
    expect(r.map((x) => x.booking_id)).toEqual(["c", "b"]);
  });
});

describe("translations", () => {
  it("every new Home label exists in en, hi and te", () => {
    const keys = ["Not_Taking_Bookings", "Turn_ON_to_receive_bookings", "Ready_for_Bookings", "You_can_receive_new_bookings", "ON_Not_Ready_Yet", "Your_Work_Priority", "Your_Rating", "Earned_today", "Paid_to_you_today", "Jobs_done_today", "Upcoming_jobs", "Next_Booking", "No_bookings_assigned_yet"];
    for (const l of [en, hi, te] as any[]) for (const k of keys) expect(l.worker[k], k).toBeTruthy();
    expect(Object.keys(HOME_AVAILABILITY_GUIDE).sort()).toEqual(["en", "hi", "te"]);
  });
});
