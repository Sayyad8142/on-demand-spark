import { expect, test } from "bun:test";
import { score, rank } from "./formula30d";
const asOf = "2026-10-16T00:00:00Z";
const d = (n: number) => new Date(Date.parse(asOf) - n * 86_400_000).toISOString();
const base = { asOf, completedAt: [], faults: [], rating: null, validRatings: 0 };
test("new worker = 25", () => expect(score(base).score).toBe(25));
test("completed +1", () => expect(score({ ...base, completedAt: [d(1)] }).score).toBe(26));
test("job older than 30 days expires", () => expect(score({ ...base, completedAt: [d(31), d(30)] }).score).toBe(25));
test("rating bonus +5 needs 4.8 and 5 ratings", () => {
  expect(score({ ...base, rating: 4.8, validRatings: 5 }).score).toBe(30);
  expect(score({ ...base, rating: 4.8, validRatings: 4 }).score).toBe(25);
  expect(score({ ...base, rating: 4.79, validRatings: 50 }).score).toBe(25);
});
test("bonus never stacks across recomputes", () => {
  const i = { ...base, rating: 5, validRatings: 9 };
  expect(score(i).score).toBe(score(i).score); expect(score(i).bonus).toBe(5);
});
test("penalty weights", () => {
  const f = (r: string) => score({ ...base, completedAt: Array(30).fill(d(1)), faults: [{ booking_id: "b", event_id: "e", reason_code: r, at: d(1), verified: true }] }).score;
  expect(f("worker_no_show")).toBe(35); expect(f("no_movement")).toBe(55); // disabled for now
  expect(f("worker_cancelled")).toBe(45); expect(f("complaint_verified")).toBe(45);
  expect(f("worker_refused")).toBe(55); // not an approved penalty
});
test("duplicate incident deducts once", () => {
  const x = { booking_id: "b1", event_id: "e1", reason_code: "worker_no_show", at: d(1), verified: true };
  expect(score({ ...base, faults: [x, { ...x, event_id: "e2" }] }).score).toBe(5);
});
test("expired penalty restores points", () =>
  expect(score({ ...base, faults: [{ booking_id: "b", event_id: "e", reason_code: "worker_no_show", at: d(31), verified: true }] }).score).toBe(25));
test("floor 0 stays 0, ceiling 100", () => {
  const nf = ["a","b"].map((b) => ({ booking_id: b, event_id: b, reason_code: "worker_no_show", at: d(1), verified: true }));
  expect(score({ ...base, faults: nf }).score).toBe(0);
  expect(score({ ...base, completedAt: Array(200).fill(d(1)), rating: 5, validRatings: 9 }).score).toBe(100);
});
test("dispatch order: score, rating, longest since offer", () => {
  const r = rank([
    { id: "a", score: 50, rating: 4.9, lastOfferAt: d(1) },
    { id: "b", score: 60, rating: 3, lastOfferAt: d(0) },
    { id: "c", score: 50, rating: 4.9, lastOfferAt: d(5) },
    { id: "d", score: 50, rating: 5, lastOfferAt: d(0) },
  ]).map((w) => w.id);
  expect(r).toEqual(["b", "d", "c", "a"]);
});
test("unverified event never deducts", () =>
  expect(score({ ...base, faults: [{ booking_id: "b", event_id: "e", reason_code: "worker_no_show", at: d(1), verified: false }] }).score).toBe(25));
test("late = 0, refused = 0", () => {
  const f = (r: string) => score({ ...base, faults: [{ booking_id: "b", event_id: "e", reason_code: r, at: d(1), verified: true }] }).score;
  expect(f("worker_late")).toBe(25); expect(f("worker_refused")).toBe(25);
});
test("verified complaint -10 once", () => {
  const c = { booking_id: "b", event_id: "c1", reason_code: "complaint_verified", at: d(2), verified: true };
  expect(score({ ...base, completedAt: [d(1)], faults: [c, { ...c, event_id: "c2" }] }).score).toBe(16);
});
