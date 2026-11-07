// Offline tests (deno test). Nothing here talks to production.
import { assertEquals } from "jsr:@std/assert@1";
import { applyMode, decideNotifyAccess, internalKeyMatches, type VerifiedCaller } from "./notify_auth.ts";

const worker = (over: Partial<VerifiedCaller> = {}): VerifiedCaller => ({
  role: "authenticated", userId: "u1", isAdmin: false, ownWorkerIds: ["w1"], ...over,
});

Deno.test("dispatch (service_role) can send booking alerts", () => {
  const d = decideNotifyAccess({ role: "service_role", userId: null, isAdmin: false, ownWorkerIds: [] }, { workerIds: ["w1", "w2"], type: "BOOKING_ALERT" });
  assertEquals(d.allow, true);
});

Deno.test("no token → 401", () => {
  const d = decideNotifyAccess(null, { workerIds: ["w1"], type: "BOOKING_ALERT" });
  assertEquals(d, { allow: false, status: 401, reason: "no_verified_token" });
});

Deno.test("anon key cannot send fake booking alerts", () => {
  const d = decideNotifyAccess({ role: "anon", userId: null, isAdmin: false, ownWorkerIds: [] }, { workerIds: ["w1"], type: "BOOKING_ALERT" });
  assertEquals(d.allow, false);
});

Deno.test("a worker cannot alert other workers", () => {
  const d = decideNotifyAccess(worker(), { workerIds: ["w2"], type: "BOOKING_ALERT" });
  assertEquals(d.allow, false);
});

Deno.test("a worker cannot send a fake booking alert even to herself", () => {
  const d = decideNotifyAccess(worker(), { workerIds: ["w1"], type: "BOOKING_ALERT" });
  assertEquals(d.allow, false);
});

Deno.test("a worker may send a test push to her own phone", () => {
  assertEquals(decideNotifyAccess(worker(), { workerIds: ["w1"], type: "TEST_PUSH" }).allow, true);
});

Deno.test("admin may send", () => {
  assertEquals(decideNotifyAccess(worker({ isAdmin: true }), { workerIds: ["w9"], type: "BOOKING_ALERT" }).allow, true);
});

Deno.test("observe mode never blocks, only logs; enforce blocks", () => {
  const refused = decideNotifyAccess(null, { workerIds: ["w1"], type: "BOOKING_ALERT" });
  assertEquals(applyMode(refused, "observe").block, false);
  assertEquals(applyMode(refused, "enforce").block, true);
});

const anonCaller: VerifiedCaller = { role: "anon", userId: null, isAdmin: false, ownWorkerIds: [] };

Deno.test("DB trigger with valid internal key may send cancellation (anon bearer kept)", () => {
  const d = decideNotifyAccess({ ...anonCaller, internalKeyValid: true }, { workerIds: ["w1"], type: "BOOKING_CANCELLED" });
  assertEquals(d, { allow: true, reason: "internal_key" });
});

Deno.test("anon key without internal key is still refused for reminder cancel", () => {
  const d = decideNotifyAccess(anonCaller, { workerIds: ["w1"], type: "START_OTP_REMINDER_CANCEL" });
  assertEquals(d.allow, false);
});

Deno.test("internal key compare: exact match only, empty never matches", () => {
  assertEquals(internalKeyMatches("abc123", "abc123"), true);
  assertEquals(internalKeyMatches("abc124", "abc123"), false);
  assertEquals(internalKeyMatches("abc", "abc123"), false);
  assertEquals(internalKeyMatches("", ""), false);
  assertEquals(internalKeyMatches(null, "abc"), false);
  assertEquals(internalKeyMatches("abc", undefined), false);
});

Deno.test("observe mode never blocks the legitimate callers' old anon calls", () => {
  const d = decideNotifyAccess(anonCaller, { workerIds: ["w1"], type: "BOOKING_ALERT" });
  assertEquals(applyMode(d, "observe").block, false);
  assertEquals(applyMode(d, "enforce").block, true);
});
