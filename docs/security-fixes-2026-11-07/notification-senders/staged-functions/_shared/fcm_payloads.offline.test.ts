// Run: deno test docs/security-fixes-2026-11-07/notification-senders/staged-functions/_shared/fcm_payloads.offline.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildKeepalivePingPayload,
  buildWorkerPausedPayload,
  isSilent,
  validateSendFcmPayload,
} from "./fcm_payloads.ts";

const W = "3f2b6c1e-8d4a-4b7e-9c11-2a5d6e7f8a90";

Deno.test("old watchdog payload ({token: ...}) is rejected by send-fcm", () => {
  assertEquals(validateSendFcmPayload({ token: "abc", data: { type: "WORKER_PAUSED" } }), "Invalid workerIds");
});

Deno.test("new pause payload is accepted and targets only that worker", () => {
  const p = buildWorkerPausedPayload(W, "stale_heartbeat", "Bookings paused", "Open the app to resume");
  assertEquals(validateSendFcmPayload(p), null);
  assertEquals(p.workerIds, [W]);
  assertEquals(p.data.type, "WORKER_PAUSED");
  assertEquals(p.data.actionable, "false");
  assert(!("token" in p));
});

Deno.test("pause notice is visible (not silent)", () => {
  assert(!isSilent(buildWorkerPausedPayload(W, "no_fcm_token", "t", "b").data));
});

Deno.test("old keep-alive payload (empty title/body) is rejected", () => {
  assertEquals(validateSendFcmPayload({ workerIds: [W], title: "", body: "", data: { type: "PING" } }), "Missing title or body");
});

Deno.test("new keep-alive payload is accepted and stays silent", () => {
  const p = buildKeepalivePingPayload([W], 1_700_000_000_000);
  assertEquals(validateSendFcmPayload(p), null);
  assert(isSilent(p.data));
  assertEquals(p.data.ts, "1700000000000");
});

Deno.test("keep-alive payload never carries availability fields", () => {
  const p = buildKeepalivePingPayload([W], 1);
  const keys = JSON.stringify(p);
  assert(!keys.includes("is_available"));
  assert(!keys.includes("availability"));
});

Deno.test("non-uuid worker ids are rejected", () => {
  assertEquals(validateSendFcmPayload(buildKeepalivePingPayload(["fcm-token-xyz"], 1)), "Invalid worker ID format");
});
