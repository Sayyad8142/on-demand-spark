import { assertEquals, assert } from "jsr:@std/assert@1";
import { createHandler } from "./handler.ts";
import { slotAt, availabilityReason, snapshot, type Candidate } from "./core.ts";
const NOW = Date.parse("2026-11-12T08:40:00Z");
const me: Candidate = { id: "a", full_name: "Ada Private", priority_score: 80, rating: 4.5, is_active: true, is_blocked: false, is_available: true, is_busy: false, communities: ["c"], service_types: ["maid"] };
const slots = [{ worker_id: "a", day_of_week: 4, slots: ["14:00:00"] }];
function setup(overrides: { auth?: boolean; anonymous?: boolean; linked?: Candidate[]; workers?: Candidate[]; busy?: string[]; failure?: string; pages?: boolean; clock?: () => number } = {}) {
  const calls: URL[] = [], methods: string[] = [];
  const mockFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input)); calls.push(url); methods.push(init?.method ?? "GET");
    if (url.pathname === "/auth/v1/user") return Response.json(overrides.auth === false ? { message: "invalid", code: "bad_jwt" } : { id: "u1", role: "authenticated", is_anonymous: overrides.anonymous ?? false }, { status: overrides.auth === false ? 401 : 200 });
    const table = url.pathname.split("/").pop();
    if (overrides.failure === table) return Response.json({ message: "private failure" }, { status: 500 });
    if (table === "workers") {
      if (url.searchParams.has("user_id")) {
        assertEquals(url.searchParams.get("user_id"), "eq.u1");
        return Response.json(overrides.linked ?? [me]);
      }
      assertEquals(url.searchParams.get("communities"), "cs.{c}");
      assertEquals(url.searchParams.get("service_types"), "cs.{maid}");
      if (overrides.pages) {
        const offset = Number(url.searchParams.get("offset"));
        return Response.json(offset < 1000 ? Array.from({ length: 500 }, (_, i) => ({ ...me, id: `w${offset+i}` })) : [me]);
      }
      return Response.json(overrides.workers ?? [me]);
    }
    if (table === "worker_availability") { assertEquals(url.searchParams.get("day_of_week"), "eq.4"); return Response.json(slots); }
    if (table === "bookings") {
      assertEquals(url.searchParams.get("select"), "worker_id");
      assertEquals(url.searchParams.get("or"), "(status.is.null,status.not.in.(completed,cancelled,rejected,failed,timeout))");
      return Response.json((overrides.busy ?? []).map(worker_id => ({ worker_id })));
    }
    throw Error("unexpected_network");
  };
  const handler = createHandler({ env: name => ({ SUPABASE_URL: "https://test.invalid", SUPABASE_ANON_KEY: "test-anon", SUPABASE_SERVICE_ROLE_KEY: "test-service" })[name], fetch: mockFetch, now: overrides.clock ?? (() => NOW) });
  const request = (body = "{}", auth = "Bearer fixture", method = "POST") => handler(new Request("https://local.invalid", { method, headers: { Authorization: auth, "Content-Type": "application/json" }, ...(method === "POST" ? { body } : {}) }));
  return { request, calls, methods };
}
Deno.test("CORS preflight performs no data reads", async () => { const s = setup(); const r = await s.request("", "", "OPTIONS"); assertEquals(r.status, 200); assert(r.headers.get("access-control-allow-headers")?.includes("authorization")); assertEquals(s.calls.length, 0); await r.text(); });
Deno.test("missing authentication refuses with CORS", async () => { const s = setup(); const r = await s.request("{}", ""); assertEquals(r.status, 401); assertEquals(r.headers.get("cache-control"), "no-store"); assert(r.headers.has("access-control-allow-origin")); assertEquals(s.calls.length, 0); await r.text(); });
Deno.test("forged or expired JWT refuses before service-role data reads", async () => { const s = setup({ auth: false }); const r = await s.request(); assertEquals(r.status, 401); assertEquals(s.calls.length, 1); await r.text(); });
Deno.test("anonymous login refuses before worker reads", async () => { const s = setup({ anonymous: true }); const r = await s.request(); assertEquals(r.status, 401); assertEquals(s.calls.length, 1); await r.text(); });
Deno.test("no worker identity has no fallback", async () => { const s = setup({ linked: [] }); const r = await s.request(); assertEquals(r.status, 403); assertEquals(s.calls.length, 2); await r.text(); });
Deno.test("duplicate worker identity refuses", async () => { const r = await setup({ linked: [me, { ...me, id: "b" }] }).request(); assertEquals(r.status, 403); await r.text(); });
for (const [name, body, status] of [
  ["malformed JSON", "{", 400], ["caller worker id", '{"worker_id":"a"}', 400],
  ["null selector", '{"community":null}', 400], ["invalid service", '{"service":"cook"}', 400],
  ["community injection", '{"community":"other"}', 403], ["unassigned service", '{"service":"bathroom_cleaning"}', 403],
  ["oversized body", " ".repeat(2049), 413],
] as const) Deno.test(`${name} is rejected`, async () => { const s = setup(); const r = await s.request(body); assertEquals(r.status, status); assert(s.calls.length <= 2); await r.text(); });
Deno.test("successful adapter returns only privacy-safe fields and uses GET reads only", async () => {
  const s = setup(); const r = await s.request(); assertEquals(r.status, 200);
  const data = await r.json(); assertEquals(Object.keys(data).sort(), ["version","updatedAt","slotStart","slotEnd","community","service","communities","services","reason","rows"].sort());
  assertEquals(data.rows, [{ rank: 1, name: "Ada", priority: 80, rating: 4.5, isMe: true }]);
  assert(s.methods.every(m => m === "GET")); assert(!s.calls.some(u => u.pathname.includes("rpc") || u.pathname.includes("functions")));
  assert(s.calls.every(u => !u.searchParams.get("select")?.includes("phone"))); assert(s.calls.every(u => !u.searchParams.get("select")?.includes("user_id")));
});
Deno.test("booking assignment overrides free busy flag", async () => { const r = await setup({ busy: ["a"] }).request(); const data = await r.json(); assertEquals(data.reason, "busy"); assertEquals(data.rows, []); });
Deno.test("any database failure returns generic error only", async () => { const r = await setup({ failure: "worker_availability" }).request(); assertEquals(r.status, 503); assertEquals(await r.json(), { error: "unable_to_verify" }); });
Deno.test("pagination fetches worker rows past 1000", async () => { const s = setup({ pages: true }); const r = await s.request(); assertEquals(r.status, 200); assert(s.calls.some(u => u.pathname.endsWith("workers") && u.searchParams.get("offset") === "1000")); await r.text(); });
Deno.test("slot rollover during reads refuses stale answer", async () => { let n = 0; const r = await setup({ clock: () => ++n === 1 ? NOW : NOW + 1800000 }).request(); assertEquals(r.status, 503); await r.text(); });
Deno.test("missing managed configuration fails closed", async () => { const r = await createHandler({ env: () => undefined })(new Request("https://local.invalid", { method: "POST", headers: { Authorization: "Bearer fixture" }, body: "{}" })); assertEquals(r.status, 503); await r.text(); });
Deno.test("14:10 IST chooses Thursday 14:00–14:30", () => assertEquals(slotAt(NOW), { start: Date.parse("2026-11-12T08:30:00Z"), end: Date.parse("2026-11-12T09:00:00Z"), day: 4, key: "14:00:00" }));
Deno.test("slot boundary and IST day rollover", () => { assertEquals(slotAt(Date.parse("2026-11-12T09:00:00Z")).key, "14:30:00"); assertEquals(slotAt(Date.parse("2026-11-12T18:30:00Z")).day, 5); });
for (const [name, changes, expected] of [
  ["OFF", { is_available: false }, "off"], ["busy", { is_busy: true }, "busy"],
  ["blocked", { is_blocked: true }, "inactive"], ["inactive", { is_active: false }, "inactive"],
  ["wrong community", { communities: ["other"] }, "unable"], ["wrong service", { service_types: ["bathroom_cleaning"] }, "unable"],
] as const) Deno.test(`${name} excludes candidate`, () => assertEquals(availabilityReason({ ...me, ...changes } as Candidate, slots, new Set(), "c", "maid", NOW), expected));
Deno.test("unsaved current slot excludes candidate", () => assertEquals(availabilityReason(me, [], new Set(), "c", "maid", NOW), "no_slot"));
Deno.test("priority then rating then deterministic id ordering", () => {
  const ws = [{ ...me, id: "b" }, me, { ...me, id: "c", rating: 5 }, { ...me, id: "d", priority_score: 90, rating: 0 }];
  const data = snapshot(me, ws, ws.map(w => ({ ...slots[0], worker_id: w.id })), new Set(), "c", "maid", ["c"], ["maid"], NOW);
  assertEquals(data.rows.map(r => [r.priority,r.rating,r.isMe]), [[90,0,false],[80,5,false],[80,4.5,true],[80,4.5,false]]);
});