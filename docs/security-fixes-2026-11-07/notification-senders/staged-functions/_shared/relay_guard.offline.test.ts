// Offline paths only (no network): service key, internal key, no token, mode switch, bad booking id.
import { assertEquals } from "jsr:@std/assert@1";
Deno.env.set("SUPABASE_URL", "http://127.0.0.1:9"); Deno.env.set("SUPABASE_ANON_KEY", "anon-test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-test"); Deno.env.set("DISPATCH_INTERNAL_KEY", "internal-test");
const { guardRelay, verifyRedispatch } = await import("./relay_guard.ts");
const req = (h: Record<string, string>) => new Request("http://x", { method: "POST", headers: h });
const relays = ["booking-notifications", "notify-next-tier", "fcm-keepalive", "worker-health-watchdog"] as const;

for (const r of relays) {
  Deno.test(`enforce: ${r} — service key allowed`, async () => {
    Deno.env.set("NOTIFY_AUTH_MODE", "enforce");
    assertEquals(await guardRelay(req({ Authorization: "Bearer service-test" }), r, {}), null);
  });
  Deno.test(`enforce: ${r} — cron internal key allowed`, async () => {
    Deno.env.set("NOTIFY_AUTH_MODE", "enforce");
    assertEquals(await guardRelay(req({ "x-internal-key": "internal-test" }), r, {}), null);
  });
  Deno.test(`enforce: ${r} — no credentials refused`, async () => {
    Deno.env.set("NOTIFY_AUTH_MODE", "enforce");
    assertEquals((await guardRelay(req({}), r, {}, "not-a-uuid"))?.status, 401);
  });
  Deno.test(`observe: ${r} — no credentials still passes (watch only)`, async () => {
    Deno.env.delete("NOTIFY_AUTH_MODE");
    assertEquals(await guardRelay(req({}), r, {}, "not-a-uuid"), null);
  });
}
Deno.test("redispatch check refuses a malformed booking id without any lookup", async () => {
  assertEquals(await verifyRedispatch("x"), false);
  assertEquals(await verifyRedispatch(undefined), false);
});
