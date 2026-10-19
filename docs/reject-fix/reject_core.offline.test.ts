import { PGlite } from "@electric-sql/pglite";
import { test, expect } from "bun:test";
import { readFileSync } from "fs";
const strip=(s:string)=>s.slice(s.indexOf("CREATE OR REPLACE"));
const OLD=strip(readFileSync("/dev-server/docs/reject-fix/000_reject_core_LIVE_BACKUP.sql","utf8"));
const NEW=readFileSync("/tmp/pg/fixed.sql","utf8");
const B="11111111-1111-1111-1111-111111111111";
const W=(n:number)=>`00000000-0000-0000-0000-00000000000${n}`;
async function db(fn:string, tiers:number[]){
  const d=new PGlite();
  await d.exec(`create table bookings(id uuid primary key,status text);
  create table booking_requests(booking_id uuid,worker_id uuid,status text,responded_at timestamptz,order_sequence int,offered_at timestamptz,timeout_at timestamptz);
  insert into bookings values('${B}','pending');`);
  for(let i=0;i<tiers.length;i++) await d.exec(`insert into booking_requests values('${B}','${W(i+1)}','pending',null,${tiers[i]},null,null)`);
  await d.exec(fn); return d;
}
const rej=(d:PGlite,w:string)=>d.query<{r:any}>(`select public._reject_booking_request_core('${B}','${w}') r`);
const st=async(d:PGlite,w:string)=>(await d.query<{status:string}>(`select status from booking_requests where worker_id='${w}'`)).rows[0].status;

test("LIVE: one-worker-per-tier reject fails with malformed array literal and rolls back", async()=>{
  const d=await db(OLD,[1,2,3]);
  await expect(rej(d,W(1))).rejects.toThrow(/malformed array literal/);
  expect(await st(d,W(1))).toBe("pending");
});
test("FIX: reject confirmed, next tier activated, rejected offer stays rejected", async()=>{
  const d=await db(NEW,[1,2,3]);
  const r=(await rej(d,W(1))).rows[0].r;
  expect(r.success).toBe(true); expect(r.next_tier).toBe(2); expect(r.should_notify).toBe(true);
  expect(await st(d,W(1))).toBe("rejected");
  const t=(await d.query<{n:number}>(`select count(*)::int n from booking_requests where order_sequence=2 and timeout_at is not null`)).rows[0].n;
  expect(t).toBe(1);
});
test("FIX: next tier with several workers activates all of them", async()=>{
  const d=await db(NEW,[1,2,2]);
  expect((await rej(d,W(1))).rows[0].r.success).toBe(true);
  expect((await d.query<{n:number}>(`select count(*)::int n from booking_requests where order_sequence=2 and timeout_at is not null`)).rows[0].n).toBe(2);
});
test("FIX: last tier reject -> no more tiers, no notify", async()=>{
  const d=await db(NEW,[1]);
  const r=(await rej(d,W(1))).rows[0].r;
  expect(r.message).toBe("rejected-no-more-tiers"); expect(r.should_notify).toBe(false);
});
test("FIX: second reject of same offer -> request-not-found, nothing changes", async()=>{
  const d=await db(NEW,[1,2]);
  await rej(d,W(1));
  expect((await rej(d,W(1))).rows[0].r.error).toBe("request-not-found");
});
test("FIX: booking already accepted -> refused, offer untouched", async()=>{
  const d=await db(NEW,[1,2]);
  await d.exec(`update bookings set status='assigned'`);
  expect((await rej(d,W(1))).rows[0].r.error).toBe("booking-already-accepted");
  expect(await st(d,W(1))).toBe("pending");
});
test("FIX: other worker's offer untouched", async()=>{
  const d=await db(NEW,[1,2]);
  await rej(d,W(1));
  expect(await st(d,W(2))).toBe("pending");
});
