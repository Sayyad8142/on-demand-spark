// Offline end-to-end decisions for every legitimate notification flow, in both
// rollout modes, plus the bypass attempts that must be refused once enforced.
// Run: deno test --no-check staged-functions/_shared/notification_flows.offline.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { applyMode, decideNotifyAccess, type VerifiedCaller } from "./notify_auth.ts";
import { decideRelayAccess } from "./relay_auth.ts";
import { buildFcmMessage, buildKeepalivePingPayload, buildWorkerPausedPayload, callerPayloads, validateSendFcmPayload, type SendFcmPayload } from "./fcm_payloads.ts";

const W1 = "3f2b6c1e-8d4a-4b7e-9c11-2a5d6e7f8a90";
const W2 = "8a1d0c2b-1111-4c3d-8e9f-0a1b2c3d4e5f";
const B = "b0000000-0000-4000-8000-000000000001";

const service: VerifiedCaller = { role: "service_role", userId: null, isAdmin: false, ownWorkerIds: [] };
const trigger: VerifiedCaller = { role: null, userId: null, isAdmin: false, ownWorkerIds: [], internalKeyValid: true };
const anon: VerifiedCaller = { role: "anon", userId: null, isAdmin: false, ownWorkerIds: [] };
const worker: VerifiedCaller = { role: "authenticated", userId: "u1", isAdmin: false, ownWorkerIds: [W1] };

function sendFcm(caller: VerifiedCaller | null, p: SendFcmPayload, mode: "observe" | "enforce") {
  const bad = validateSendFcmPayload(p);
  if (bad) return { status: 400 };
  const d = decideNotifyAccess(caller, { workerIds: p.workerIds, type: p.data.type });
  return applyMode(d, mode).block ? { status: (d as { status: number }).status } : { status: 200 };
}

const legit: Array<[string, VerifiedCaller, SendFcmPayload]> = [
  ["normal booking alert (booking-notifications, service key)", service, callerPayloads.bookingAlert([W1, W2], B)],
  ["favourite-worker alert (same sender, single preferred worker)", service, callerPayloads.bookingAlert([W1], B, { offer_kind: "worker_offer" })],
  ["rejection redispatch (notify-next-tier, staged service key)", service, callerPayloads.bookingAlert([W2], B, { booking_type: "scheduled" })],
  ["cancellation (DB trigger, internal key)", trigger, callerPayloads.cancellation(W1, B)],
  ["Start OTP reminder cancel (DB trigger, internal key)", trigger, callerPayloads.reminderCancel(W1, B)],
  ["worker paused (watchdog, service key)", service, buildWorkerPausedPayload(W1, "stale_heartbeat", "Bookings paused", "Open the app")],
  ["keep-alive ping (fcm-keepalive, service key)", service, buildKeepalivePingPayload([W1, W2], 1)],
];

for (const [name, caller, p] of legit) {
  for (const mode of ["observe", "enforce"] as const) {
    Deno.test(`${mode}: ${name} is delivered`, () => assertEquals(sendFcm(caller, p, mode).status, 200));
  }
  Deno.test(`enforce: ${name} faked with anon key is refused`, () => assertEquals(sendFcm(anon, p, "enforce").status, 403));
  Deno.test(`enforce: ${name} with no token is refused`, () => assertEquals(sendFcm(null, p, "enforce").status, 401));
  Deno.test(`observe: ${name} with anon key still delivered (stage 1 never blocks)`, () => assertEquals(sendFcm(anon, p, "observe").status, 200));
}

Deno.test("enforce: a worker cannot send a booking alert to another worker", () => {
  assertEquals(sendFcm(worker, callerPayloads.bookingAlert([W2], B), "enforce").status, 403);
});
Deno.test("enforce: a worker cannot send PING or WORKER_PAUSED even to self", () => {
  assertEquals(sendFcm(worker, buildKeepalivePingPayload([W1], 1), "enforce").status, 403);
  assertEquals(sendFcm(worker, buildWorkerPausedPayload(W1, "no_fcm_token", "t", "b"), "enforce").status, 403);
});

// Message shape actually sent to Google
Deno.test("booking alert, cancellation, reminder cancel and ping are data-only (no tray notification)", () => {
  for (const p of [callerPayloads.bookingAlert([W1], B), callerPayloads.cancellation(W1, B), callerPayloads.reminderCancel(W1, B), buildKeepalivePingPayload([W1], 1)]) {
    assert(!("notification" in buildFcmMessage("tok", p).message), p.data.type);
  }
});
Deno.test("worker-paused notice shows a visible notification", () => {
  const m = buildFcmMessage("tok", buildWorkerPausedPayload(W1, "stale_heartbeat", "Bookings paused", "Open the app")).message;
  assert("notification" in m);
});
Deno.test("reminder cancel lives 2 h; others 60 s", () => {
  assertEquals(buildFcmMessage("t", callerPayloads.reminderCancel(W1, B)).message.android.ttl, "7200s");
  assertEquals(buildFcmMessage("t", buildKeepalivePingPayload([W1], 1)).message.android.ttl, "60s");
});

// Relays: no flow can skip the guard by calling the function in front of send-fcm
Deno.test("relays: anon/no-token callers refused for every relay", () => {
  for (const r of ["booking-notifications", "notify-next-tier", "fcm-keepalive", "worker-health-watchdog"] as const) {
    assertEquals(decideRelayAccess(r, anon).allow, false, r);
    assertEquals(decideRelayAccess(r, null).allow, false, r);
  }
});
Deno.test("relays: cron/trigger/service callers allowed", () => {
  assert(decideRelayAccess("fcm-keepalive", trigger).allow);
  assert(decideRelayAccess("worker-health-watchdog", service).allow);
  assert(decideRelayAccess("booking-notifications", service).allow);
});
Deno.test("rejection redispatch from the app allowed only when the server confirms a real rejection", () => {
  assert(decideRelayAccess("notify-next-tier", anon, { redispatchVerified: true }).allow);
  assertEquals(decideRelayAccess("notify-next-tier", anon, { redispatchVerified: false }).allow, false);
  assertEquals(decideRelayAccess("booking-notifications", anon, { redispatchVerified: true }).allow, false);
});
