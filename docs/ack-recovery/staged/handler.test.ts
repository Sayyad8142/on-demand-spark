// Offline tests for the staged ack-booking-delivery handler.
// Run: cd docs/ack-recovery/staged && env -i PATH="$PATH" bun test
// Uses an in-memory fake of the Supabase query builder — no network, no DB.
import { describe, expect, test } from "bun:test";
import { makeHandler, isSafeWorkerId } from "./handler.ts";

type Row = Record<string, any>;
const W1 = "11111111-1111-4111-8111-111111111111";
const W2 = "22222222-2222-4222-8222-222222222222";
const B1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const R1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const R2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const B2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function makeDb() {
  const db: Record<string, Row[]> = {
    workers: [
      { id: W1, user_id: "firebaseUidOne", no_ack_count: 2, notification_health: "degraded", fcm_token_status: "active" },
      { id: W2, user_id: "firebaseUidTwo", no_ack_count: 0, notification_health: "good", fcm_token_status: "active" },
    ],
    booking_requests: [
      { id: R1, booking_id: B1, worker_id: W1, status: "pending", created_at: "2026-10-17T10:00:00Z" },
      { id: R2, booking_id: B2, worker_id: W2, status: "pending", created_at: "2026-10-17T10:00:00Z" },
    ],
    booking_offer_events: [],
    token_repair_events: [],
    bookings: [{ id: B1, status: "pending", worker_id: null }],
  };
  return db;
}

function fakeAdmin(db: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let lim: number | null = null;
      let mode: "select" | "update" = "select";
      let patch: Row = {};
      const run = () => {
        const rows = (db[table] ??= []).filter((r) => filters.every((f) => f(r)));
        if (mode === "update") { rows.forEach((r) => Object.assign(r, patch)); return { data: null, error: null }; }
        return { data: lim === null ? rows : rows.slice(0, lim), error: null };
      };
      const b: any = {
        select: () => b,
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
        or: (expr: string) => {
          // Mimics PostgREST: comma-separated "col.eq.value" alternatives.
          const alts = expr.split(",").map((p) => p.split(".eq."));
          filters.push((r) => alts.some(([c, v]) => String(r[c]) === v));
          return b;
        },
        order: () => b,
        limit: (n: number) => { lim = n; return b; },
        maybeSingle: async () => {
          const { data } = run();
          if (data!.length > 1) return { data: null, error: { message: "multiple rows" } };
          return { data: data![0] ?? null, error: null };
        },
        update: (p: Row) => { mode = "update"; patch = p; return b; },
        insert: async (row: Row) => { db[table].push(row); return { error: null }; },
        upsert: async (row: Row, opts: { onConflict: string; ignoreDuplicates: boolean }) => {
          const keys = opts.onConflict.split(",");
          const dup = db[table].some((r) => keys.every((k) => r[k] === row[k]));
          if (!dup) db[table].push(row);
          return { error: null };
        },
        then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
      };
      return b;
    },
  };
}

function setup(jwtUid: string | null = null) {
  const db = makeDb();
  let adminCalls = 0;
  const handler = makeHandler({
    admin: () => { adminCalls++; return fakeAdmin(db); },
    userClient: () => ({ auth: { getUser: async () => ({ data: { user: jwtUid ? { id: jwtUid } : null } }) } }),
  });
  const call = async (body: unknown, auth: string | null = "Bearer anon") => {
    const res = await handler(new Request("http://x/ack", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
      body: JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json() };
  };
  return { db, call, adminCalls: () => adminCalls };
}

const snapshot = (db: Record<string, Row[]>) => JSON.stringify(db);

describe("contract", () => {
  test("push_received and popup_shown are accepted (the outage events)", async () => {
    const { call, db } = setup();
    expect((await call({ booking_id: B1, worker_id: "firebaseUidOne", event_type: "push_received" })).status).toBe(200);
    expect((await call({ booking_id: B1, worker_id: "firebaseUidOne", event_type: "popup_shown" })).status).toBe(200);
    const r = db.booking_requests.find((x) => x.id === R1)!;
    expect(r.push_delivered_at).toBeTruthy();
    expect(r.popup_shown_at).toBeTruthy();
  });

  test.each([["received", "push_received"], ["push_delivered", "push_received"], ["opened", "worker_seen"], ["seen", "worker_seen"], ["popup", "popup_shown"]])(
    "legacy alias %s maps to %s", async (alias, canonical) => {
      const { call, db } = setup();
      const res = await call({ booking_id: B1, worker_id: "firebaseUidOne", event_type: alias });
      expect(res.status).toBe(200);
      expect(db.booking_offer_events.map((e) => e.event_type)).toEqual([canonical]);
    });

  test("legacy `event` field name is accepted", async () => {
    const { call } = setup();
    expect((await call({ booking_id: B1, worker_id: "firebaseUidOne", event: "received" })).status).toBe(200);
  });

  test("unknown event is 400 and writes nothing", async () => {
    const { call, db } = setup();
    const before = snapshot(db);
    expect((await call({ booking_id: B1, worker_id: "firebaseUidOne", event_type: "bogus" })).status).toBe(400);
    expect(snapshot(db)).toBe(before);
  });

  test("missing ids / bad uuid / missing auth are rejected", async () => {
    const { call } = setup();
    expect((await call({ worker_id: "firebaseUidOne", event_type: "push_received" })).status).toBe(400);
    expect((await call({ booking_id: "not-a-uuid", worker_id: "firebaseUidOne", event_type: "push_received" })).status).toBe(400);
    expect((await call({ booking_id: B1, worker_id: "firebaseUidOne", event_type: "push_received" }, null)).status).toBe(401);
  });
});

describe("authorization", () => {
  test.each([
    "firebaseUidOne,id.neq.x",
    `x,id.eq.${W2}`,
    "x),or(user_id.eq.firebaseUidTwo",
    "a.b",
    "",
    "x".repeat(129),
  ])("worker_id injection payload %p is 400 before any DB access", async (payload) => {
    const { call, adminCalls } = setup();
    const res = await call({ booking_id: B2, worker_id: payload, event_type: "push_received" });
    expect(res.status).toBe(400);
    expect(adminCalls()).toBe(0);
  });

  test("non-string worker_id is 400", async () => {
    const { call } = setup();
    expect((await call({ booking_id: B1, worker_id: { $ne: 1 }, event_type: "push_received" })).status).toBe(400);
  });

  test("all real worker id formats pass the validator", () => {
    expect(isSafeWorkerId("firebaseUidOne")).toBe(true);
    expect(isSafeWorkerId(W1)).toBe(true);
    expect(isSafeWorkerId("aB3_x-Z9")).toBe(true);
  });

  test("unknown worker is 403 and writes nothing", async () => {
    const { call, db } = setup();
    const before = snapshot(db);
    const res = await call({ booking_id: B1, worker_id: "nonexistentProbe", event_type: "push_received" });
    expect(res.status).toBe(403);
    expect(snapshot(db)).toBe(before);
  });

  test("worker cannot ACK another worker's offer", async () => {
    const { call, db } = setup();
    const before = snapshot(db);
    const res = await call({ booking_request_id: R2, worker_id: "firebaseUidOne", event_type: "push_received" });
    expect(res.body.reason).toBe("request_not_found");
    expect(snapshot(db)).toBe(before);
  });

  test("JWT fallback resolves only the session's own worker", async () => {
    const { call, db } = setup("firebaseUidOne");
    expect((await call({ booking_id: B1, event_type: "push_received" })).status).toBe(200);
    const res = await call({ booking_id: B2, event_type: "push_received" });
    expect(res.body.reason).toBe("request_not_found");
    expect(db.booking_requests.find((x) => x.id === R2)!.push_delivered_at).toBeUndefined();
  });
});

describe("idempotency", () => {
  test("repeat push_received keeps first timestamp, one event row, one no_ack decrement", async () => {
    const { call, db } = setup();
    await call({ booking_id: B1, worker_id: "firebaseUidOne", event_type: "push_received" });
    const first = db.booking_requests.find((x) => x.id === R1)!.push_delivered_at;
    await new Promise((r) => setTimeout(r, 5));
    const again = await call({ booking_id: B1, worker_id: "firebaseUidOne", event_type: "push_received" });
    expect(again.status).toBe(200);
    expect(db.booking_requests.find((x) => x.id === R1)!.push_delivered_at).toBe(first);
    expect(db.booking_offer_events.filter((e) => e.event_type === "push_received").length).toBe(1);
    expect(db.workers.find((w) => w.id === W1)!.no_ack_count).toBe(1);
  });

  test("first failure reason wins", async () => {
    const { call, db } = setup();
    await call({ booking_id: B1, worker_id: "firebaseUidOne", event_type: "popup_failed" });
    await call({ booking_id: B1, worker_id: "firebaseUidOne", event_type: "overlay_blocked" });
    expect(db.booking_requests.find((x) => x.id === R1)!.failure_reason).toBe("popup_failed");
  });
});

describe("isolation from assignment", () => {
  test("no event changes booking or offer status", async () => {
    const { call, db } = setup();
    for (const ev of ["push_received", "popup_shown", "worker_seen", "accept_tapped", "reject_tapped", "offer_expired", "popup_failed"]) {
      await call({ booking_id: B1, worker_id: "firebaseUidOne", event_type: ev });
    }
    expect(db.booking_requests.find((x) => x.id === R1)!.status).toBe("pending");
    expect(db.bookings[0]).toEqual({ id: B1, status: "pending", worker_id: null });
  });

  test("interaction events log only, never stamp receipt", async () => {
    const { call, db } = setup();
    await call({ booking_id: B1, worker_id: "firebaseUidOne", event_type: "accept_tapped" });
    const r = db.booking_requests.find((x) => x.id === R1)!;
    expect(r.push_delivered_at).toBeUndefined();
    expect(r.popup_shown_at).toBeUndefined();
    expect(db.booking_offer_events.map((e) => e.event_type)).toEqual(["accept_tapped"]);
  });
});
