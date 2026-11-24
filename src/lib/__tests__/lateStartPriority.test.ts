import { describe, expect, it } from "vitest";
import { lateStartNotice, parseLateStartPriority, LATE_START_PRIORITY_ENABLED } from "../lateStartPriority";
import { parsePriorityBreakdown } from "../priorityBreakdown";
const response = { contract_version: 1, settings: { enabled: true, points: 5 }, penalty: null };
const penalty = { booking_id: "booking", points: 5, confirmed_at: "2026-11-24T05:00:00Z" };
describe("Late Start server-only display", () => {
  it("uses Admin's 5 points for the warning, not a local deduction", () => {
    expect(lateStartNotice(parseLateStartPriority(response, "booking"), false)).toEqual({ kind: "warning", points: 5 });
    expect(response.settings.points).toBe(5);
  });
  it("reads changes to the Admin amount", () => {
    expect(lateStartNotice(parseLateStartPriority({ ...response, settings: { enabled: true, points: 7 } }, "booking"), false)?.points).toBe(7);
  });
  it("does not warn when Admin disables it", () => {
    expect(lateStartNotice(parseLateStartPriority({ ...response, settings: { enabled: false, points: 5 } }, "booking"), false)).toBeNull();
  });
  it("elapsed deadline alone never claims a penalty", () => {
    expect(lateStartNotice(parseLateStartPriority(response, "booking"), true)).toBeNull();
  });
  it("shows minus 5 only after the deadline and server confirmation", () => {
    const parsed = parseLateStartPriority({ ...response, penalty }, "booking");
    expect(lateStartNotice(parsed, true)).toEqual({ kind: "confirmed", points: 5 });
    expect(lateStartNotice(parsed, false)).toBeNull();
    expect(lateStartNotice(parsed, true)).toEqual({ kind: "confirmed", points: 5 });
  });
  it("keeps the confirmed historical amount after Admin changes or disables settings", () => {
    expect(lateStartNotice(parseLateStartPriority({ ...response, settings: { enabled: false, points: 7 }, penalty }, "booking"), true)?.points).toBe(5);
  });
  it("rejects another booking, unconfirmed, malformed or missing server data", () => {
    for (const input of [null, {}, { ...response, contract_version: 2 }, { ...response, penalty: { ...penalty, booking_id: "other" } }, { ...response, penalty: { ...penalty, confirmed_at: null } }, { ...response, settings: { enabled: true, points: NaN } }]) expect(parseLateStartPriority(input, "booking")).toBeNull();
  });
  it("shows an explicit minus 5 breakdown once without changing the server score", () => {
    const result = parsePriorityBreakdown("pts(c/o/r/rec/b/reach/pen/late)=15/0/25/5/10/13/2/5 final=61", 61);
    expect(result?.parts.find(p => p.key === "lateStartOtp")?.points).toBe(-5);
    expect(result?.parts.find(p => p.key === "penalties")?.points).toBe(-2);
    expect(result?.parts.filter(p => p.key === "lateStartOtp")).toHaveLength(1);
    expect(result?.final).toBe(61);
  });
  it("does not infer Late Start from legacy aggregate penalties or stale scores", () => {
    expect(parsePriorityBreakdown("pts(c/o/r/rec/b/reach/pen)=15/0/25/5/10/13/5 final=63", 63)?.parts.some(p => p.key === "lateStartOtp")).toBe(false);
    expect(parsePriorityBreakdown("pts(c/o/r/rec/b/reach/pen/late)=15/0/25/5/10/13/0/5 final=63", 68)).toBeNull();
  });
  it("keeps the unverified server integration inactive", () => expect(LATE_START_PRIORITY_ENABLED).toBe(false));
});