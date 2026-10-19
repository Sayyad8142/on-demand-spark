// Full reject flow (both APK endpoints) on a private in-memory Postgres (PGlite). No network, no production.
// Run: bun test reject_flow.offline.test.ts   (needs @electric-sql/pglite)
import { PGlite } from "@electric-sql/pglite";
import { test, expect } from "bun:test";
import { readFileSync } from "fs";
const dir = import.meta.dir;
const body = (f: string) => { const s = readFileSync(`${dir}/${f}`, "utf8"); return s.slice(s.indexOf("CREATE OR REPLACE")); };
const SCHEMA = readFileSync(`${dir}/test_schema.sql`, "utf8");
const WRAP = readFileSync(`${dir}/live_definitions/reject_wrappers_LIVE.sql`, "utf8");
const OLD = body("000_reject_core_LIVE_BACKUP.sql");
const NEW = body("001_reject_core_array_fix_DRAFT.sql").split("$function$;")[0] + "$function$;";
const B = "11111111-1111-1111-1111-111111111111";
const W = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;
const UID = (n: number) => `fbuid${n}`; // Firebase-style text uid in workers.user_id

async function setup(core: string, tiers: number[], timeoutSec: number | null = 60) {
  const d = new PGlite();
  await d.exec(SCHEMA);
  await d.exec(`insert into bookings values('${B}','pending')`);
  for (let i = 0; i < tiers.length; i++) {
    await d.exec(`insert into workers values('${W(i + 1)}','${W(i + 1)}')`);
    const t = timeoutSec === null ? "null" : `now() + interval '${timeoutSec} seconds'`;
    await d.exec(`insert into booking_requests(booking_id,worker_id,status,order_sequence,offered_at,timeout_at)
                  values('${B}','${W(i + 1)}','pending',${tiers[i]},now(),${t})`);
  }
  await d.exec(core); await d.exec(WRAP);
  return d;
}
const as = (d: PGlite, n: number) => d.exec(`select set_config('test.uid','${W(n)}',false)`);
const newApk = async (d: PGlite, n: number) => { await as(d, n); return (await d.query<{ r: any }>(`select reject_booking_offer('${B}') r`)).rows[0].r; };
const oldApk = async (d: PGlite, n: number, supplied = n) => { await as(d, n); return (await d.query<{ r: any }>(`select reject_booking_request('${B}','${W(supplied)}') r`)).rows[0].r; };
const st = async (d: PGlite, n: number) => (await d.query<{ status: string }>(`select status from booking_requests where worker_id='${W(n)}'`)).rows[0].status;

// --- reproduction on the LIVE core ---
test("LIVE core + new APK endpoint: last worker in batch rejects while next batch waits -> malformed array literal, rolled back", async () => {
  const d = await setup(OLD, [1, 2]);
  await expect(newApk(d, 1)).rejects.toThrow(/malformed array literal/);
  expect(await st(d, 1)).toBe("pending");
});
test("LIVE core + old APK endpoint: same failure", async () => {
  const d = await setup(OLD, [1, 2]);
  await expect(oldApk(d, 1)).rejects.toThrow(/malformed array literal/);
});
test("LIVE core: reject while others in same batch still pending works (no next-tier step)", async () => {
  const d = await setup(OLD, [1, 1, 2]);
  expect((await newApk(d, 1)).confirmed).toBe(true);
});

// --- fixed core ---
test("FIX: last worker in batch rejects while another batch waits -> confirmed, next batch offered", async () => {
  const d = await setup(NEW, [1, 2]);
  const r = await newApk(d, 1);
  expect(r.confirmed).toBe(true); expect(r.next_tier).toBe(2); expect(r.should_notify).toBe(true);
  expect(await st(d, 1)).toBe("rejected");
});
test("FIX: normal rejection within 60 seconds", async () => {
  const d = await setup(NEW, [1, 2], 60);
  expect((await newApk(d, 1)).confirmed).toBe(true);
});
test("FIX: rejection after 60 seconds -> offer-expired, NOT confirmed (remaining, by design)", async () => {
  const d = await setup(NEW, [1, 2], -1);
  const r = await newApk(d, 1);
  expect(r.confirmed).toBe(false); expect(r.error).toBe("offer-expired");
  expect(await st(d, 1)).toBe("pending");
});
test("FIX: rejection after the offer was re-sent (new timeout on same request) -> confirmed", async () => {
  const d = await setup(NEW, [1, 2], -1);
  await d.exec(`update booking_requests set offered_at=now(), timeout_at=now()+interval '60 seconds' where worker_id='${W(1)}'`);
  expect((await newApk(d, 1)).confirmed).toBe(true);
});
test("FIX: repeated rejection -> idempotent already_rejected, no second next-tier activation", async () => {
  const d = await setup(NEW, [1, 2, 3]);
  await newApk(d, 1);
  const r = await newApk(d, 1);
  expect(r.confirmed).toBe(true); expect(r.already_rejected).toBe(true);
  expect(await st(d, 2)).toBe("pending");
});
test("FIX: reject after another worker accepted -> booking-already-accepted, nothing changed (serialized, not true concurrency)", async () => {
  const d = await setup(NEW, [1, 2]);
  await d.exec(`update bookings set status='assigned'`);
  const r = await newApk(d, 1);
  expect(r.confirmed).toBe(false); expect(r.error).toBe("booking-already-accepted");
  expect(await st(d, 1)).toBe("pending");
});
test("FIX: old APK endpoint (reject_booking_request) -> confirmed via same path", async () => {
  const d = await setup(NEW, [1, 2]);
  expect((await oldApk(d, 1)).confirmed).toBe(true);
});
test("FIX: old APK endpoint naming another worker -> forbidden, nothing changed", async () => {
  const d = await setup(NEW, [1, 2]);
  expect((await oldApk(d, 1, 2)).error).toBe("forbidden");
  expect(await st(d, 2)).toBe("pending");
});
test("FIX: no session -> not-authenticated", async () => {
  const d = await setup(NEW, [1, 2]);
  await d.exec(`select set_config('test.uid','',false)`);
  expect((await d.query<{ r: any }>(`select reject_booking_offer('${B}') r`)).rows[0].r.error).toBe("not-authenticated");
});
