import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyHeartbeat, bearerOf, jwtRole, withTimeout } from "./heartbeat_audit.ts";

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (role: string) => `${b64({ alg: "HS256" })}.${b64({ role, sub: "u1" })}.sig`;
const ANON = jwt("anon"), USER = jwt("authenticated");
const deps = (uid: string | null, wid: string | null, fail = false) => ({
  verifyUser: async () => { if (fail) throw new Error("net"); return uid; },
  workerIdForUser: async () => wid,
});

Deno.test("no header", async () => assertEquals(await classifyHeartbeat(null, "w1", deps(null, null)), "no_auth_header"));
Deno.test("legacy anon with worker_id (old apps / expired background)", async () =>
  assertEquals(await classifyHeartbeat(`Bearer ${ANON}`, "w1", deps(null, null)), "legacy_anon"));
Deno.test("anon never calls verifyUser", async () => {
  let called = false;
  await classifyHeartbeat(`Bearer ${ANON}`, "w1", { verifyUser: async () => { called = true; return null; }, workerIdForUser: async () => null });
  assertEquals(called, false);
});
Deno.test("session match", async () => assertEquals(await classifyHeartbeat(`Bearer ${USER}`, "w1", deps("u1", "w1")), "session_match"));
Deno.test("session mismatch (someone else's worker_id)", async () => assertEquals(await classifyHeartbeat(`Bearer ${USER}`, "w2", deps("u1", "w1")), "session_mismatch"));
Deno.test("expired login", async () => assertEquals(await classifyHeartbeat(`Bearer ${USER}`, "w1", deps(null, null)), "session_invalid"));
Deno.test("login without worker row", async () => assertEquals(await classifyHeartbeat(`Bearer ${USER}`, "w1", deps("u1", null)), "session_no_worker"));
Deno.test("missing worker_id", async () => assertEquals(await classifyHeartbeat(`Bearer ${USER}`, undefined, deps("u1", "w1")), "missing_worker_id"));
Deno.test("audit errors are swallowed", async () => assertEquals(await classifyHeartbeat(`Bearer ${USER}`, "w1", deps("u1", "w1", true)), "audit_error"));
Deno.test("garbage token is not trusted", async () => {
  assertEquals(jwtRole("not-a-jwt"), null);
  assertEquals(await classifyHeartbeat("Bearer not-a-jwt", "w1", deps(null, null)), "session_invalid");
});
Deno.test("bearer parsing", () => { assertEquals(bearerOf("bearer abc"), "abc"); assertEquals(bearerOf("Basic x"), null); });
Deno.test("timeout never blocks the heartbeat", async () => {
  const t0 = Date.now();
  const r = await withTimeout(new Promise<string>(() => {}), 50, "late");
  assertEquals(r, "late"); assertEquals(Date.now() - t0 < 500, true);
  assertEquals(await withTimeout(Promise.reject(new Error("x")), 50, "fb"), "fb");
});

Deno.test("staged function only ADDS lines to the recovered live code", async () => {
  const live = (await Deno.readTextFile(new URL("../live-backup/index.ts", import.meta.url))).split("\n");
  const staged = (await Deno.readTextFile(new URL("./index.ts", import.meta.url))).split("\n");
  let i = 0;
  for (const line of staged) if (i < live.length && line === live[i]) i++;
  assertEquals(i, live.length, "every live line must remain, in order");
  const src = staged.join("\n");
  // Safety: audit never rejects or writes.
  for (const bad of ["status: 401", "status: 403"]) assertEquals(src.includes(bad), false, bad);
  const added = staged.filter((l) => !live.includes(l)).join("\n");
  for (const w of [".update(", ".insert(", ".upsert(", ".delete(", "is_available", "rpc("]) assertEquals(added.includes(w), false, w);
  assertEquals(/console\.log\([^)]*token/i.test(added), false, "no token logging");
});
