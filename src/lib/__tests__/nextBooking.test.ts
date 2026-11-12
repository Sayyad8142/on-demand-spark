import { describe, it, expect } from "vitest";
import { indiaSlot, parseNextSnapshot, NEXT_BOOKING_LIVE_ENABLED } from "../nextBooking";
import { availabilityReason, slotAt, snapshot, type Candidate } from "../../../docs/live-next-booking-2026-11-12/staged/core";
const now = Date.parse("2026-11-12T08:40:00Z"); // 14:10 IST, Thursday
const worker = (id = "a"): Candidate => ({ id, full_name: "Test Worker", priority_score: 80, rating: 4.5, is_active: true, is_blocked: false, is_available: true, is_busy: false, communities: ["c"], service_types: ["maid"] });
const slots = [{ worker_id: "a", day_of_week: 4, slots: ["14:00:00"] }];
const reason = (changes: Partial<Candidate> = {}, busy = new Set<string>(), selected = slots) => availabilityReason({ ...worker(), ...changes }, selected, busy, "c", "maid", now);
const valid = () => snapshot(worker(), [worker()], slots, new Set(), "c", "maid", ["c"], ["maid"], now);
describe("independent Next Booking eligibility", () => {
  it("14:10 IST uses 14:00–14:30 and day 4", () => { expect(indiaSlot(now)).toEqual({ start: Date.parse("2026-11-12T08:30:00Z"), end: Date.parse("2026-11-12T09:00:00Z"), day: 4, key: "14:00:00" }); expect(slotAt(now)).toEqual(indiaSlot(now)); });
  it("rolls exactly at 14:30", () => { expect(indiaSlot(Date.parse("2026-11-12T08:59:59Z")).key).toBe("14:00:00"); expect(indiaSlot(Date.parse("2026-11-12T09:00:00Z")).key).toBe("14:30:00"); });
  it("IST midnight changes weekday", () => expect(indiaSlot(Date.parse("2026-11-12T18:30:00Z"))).toMatchObject({ day: 5, key: "00:00:00" }));
  it("ON and a saved current slot qualify", () => expect(reason()).toBe("available"));
  it("OFF never qualifies", () => expect(reason({ is_available: false })).toBe("off"));
  it("busy toggle excludes", () => expect(reason({ is_busy: true })).toBe("busy"));
  it("assigned booking excludes even when toggle is free", () => expect(reason({}, new Set(["a"]))).toBe("busy"));
  it("no current working slot excludes", () => expect(reason({}, new Set(), [])).toBe("no_slot"));
  it("a different weekday slot does not qualify", () => expect(reason({}, new Set(), [{ ...slots[0], day_of_week: 5 }])).toBe("no_slot"));
  it("inactive excludes", () => expect(reason({ is_active: false })).toBe("inactive"));
  it("blocked excludes", () => expect(reason({ is_blocked: true })).toBe("inactive"));
  it("unknown flags cannot qualify", () => expect(reason({ is_busy: null })).toBe("unable"));
  it("community mismatch excludes", () => expect(reason({ communities: ["other"] })).toBe("unable"));
  it("service mismatch excludes", () => expect(reason({ service_types: ["bathroom_cleaning"] })).toBe("unable"));
  it("priority then rating then stable ID; keeps zero values", () => {
    const workers = [worker("b"), worker("a"), { ...worker("c"), rating: 5 }, { ...worker("d"), priority_score: 90, rating: 0 }];
    const result = snapshot(worker(), workers, workers.map(w => ({ ...slots[0], worker_id: w.id })), new Set(), "c", "maid", ["c"], ["maid"], now);
    expect(result.rows.map(r => [r.priority, r.rating, r.isMe])).toEqual([[90, 0, false], [80, 5, false], [80, 4.5, true], [80, 4.5, false]]);
  });
  it("safe display contains first name only and no identifiers", () => { expect(valid().rows[0]).toEqual({ rank: 1, name: "Test", priority: 80, rating: 4.5, isMe: true }); expect(Object.keys(valid().rows[0])).toEqual(["rank", "name", "priority", "rating", "isMe"]); });
  it("empty eligible list is valid for OFF worker", () => { const result = snapshot({ ...worker(), is_available: false }, [], [], new Set(), "c", "maid", ["c"], ["maid"], now); expect(parseNextSnapshot(result, now).rows).toEqual([]); });
  it("fresh contract validates", () => expect(parseNextSnapshot(valid(), now).rows).toHaveLength(1));
  it("rejects private extra fields", () => expect(() => parseNextSnapshot({ ...valid(), phone: "private" }, now)).toThrow());
  it("rejects row identifiers", () => expect(() => parseNextSnapshot({ ...valid(), rows: [{ ...valid().rows[0], id: "private" }] }, now)).toThrow());
  it("rejects stale data", () => expect(() => parseNextSnapshot(valid(), now + 21000)).toThrow());
  it("rejects previous slot", () => expect(() => parseNextSnapshot({ ...valid(), updatedAt: "2026-11-12T09:00:00Z" }, Date.parse("2026-11-12T09:00:00Z"))).toThrow());
  it("rejects unavailable worker highlighted as eligible", () => expect(() => parseNextSnapshot({ ...valid(), reason: "busy" }, now)).toThrow());
  it("production activation remains OFF", () => expect(NEXT_BOOKING_LIVE_ENABLED).toBe(false));
});