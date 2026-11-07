// Offline: only paths that need no network (service key, internal key, no token, enforce/observe).
import { assertEquals } from "jsr:@std/assert@1";
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:9"); Deno.env.set("SUPABASE_ANON_KEY", "anon-test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-test"); Deno.env.set("DISPATCH_INTERNAL_KEY", "internal-test");
const { guardNotify } = await import("./notify_guard.ts");
const req = (h: Record<string, string>) => new Request("http://x", { method: "POST", headers: h });
const alert = { workerIds: ["w1"], data: { type: "BOOKING_ALERT" } };
const cors = {};
Deno.test("enforce: service-role key allowed (dispatch, keepalive, watchdog, staged notify-next-tier)", async () => {
  Deno.env.set("NOTIFY_AUTH_MODE", "enforce");
  assertEquals(await guardNotify(req({ Authorization: "Bearer service-test" }), alert, cors, "t"), null);
});
Deno.test("enforce: DB trigger with internal key allowed (cancel, reminder cancel)", async () => {
  Deno.env.set("NOTIFY_AUTH_MODE", "enforce");
  assertEquals(await guardNotify(req({ Authorization: "Bearer not-a-jwt", "x-internal-key": "internal-test" }), { workerIds: ["w1"], data: { type: "BOOKING_CANCELLED" } }, cors, "t"), null);
});
Deno.test("enforce: no token → 401", async () => {
  Deno.env.set("NOTIFY_AUTH_MODE", "enforce");
  assertEquals((await guardNotify(req({}), alert, cors, "t"))?.status, 401);
});
Deno.test("enforce: wrong internal key + junk token → refused", async () => {
  Deno.env.set("NOTIFY_AUTH_MODE", "enforce");
  assertEquals((await guardNotify(req({ Authorization: "Bearer junk", "x-internal-key": "nope" }), alert, cors, "t"))?.status, 401);
});
Deno.test("observe (default): never blocks", async () => {
  Deno.env.delete("NOTIFY_AUTH_MODE");
  assertEquals(await guardNotify(req({}), alert, cors, "t"), null);
});
