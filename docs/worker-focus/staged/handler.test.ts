// Offline tests. Run: cd docs/worker-focus/staged && env -i PATH="$PATH" bun test
import { describe, expect, test } from "bun:test";
import { makeHandler, validateEvent } from "./handler.ts";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const W1 = "11111111-1111-4111-8111-111111111111";
const W2 = "22222222-2222-4222-8222-222222222222";

function fakeDb() {
  const db = {
    workers: [{ id: W1, user_id: "uidOne", is_available: true }, { id: W2, user_id: "uidTwo", is_available: false }],
    events: [] as any[],
    status: new Map<string, any>(),
    calls: [] as string[],
  };
  const admin = {
    from(table: string) {
      db.calls.push(table);
      if (table === "workers") {
        let col = "", val = "";
        const q: any = {
          select: () => q,
          eq: (c: string, v: string) => { col = c; val = v; return q; },
          maybeSingle: async () => ({ data: db.workers.find((w: any) => w[col] === val) ?? null }),
        };
        return q;
      }
      if (table === "worker_diagnostic_events") {
        return {
          upsert: async (rows: any[]) => {
            for (const r of rows) if (!db.events.some((e) => e.worker_id === r.worker_id && e.event_id === r.event_id)) db.events.push(r);
            return { error: null };
          },
        };
      }
      throw new Error("unexpected table " + table);
    },
    // Mirrors the SQL function's newer-wins rule.
    async rpc(name: string, a: any) {
      db.calls.push(name);
      const cur = db.status.get(a.p_worker_id);
      if (!cur || Date.parse(a.p_observed_at) > Date.parse(cur.observed_at)) {
        db.status.set(a.p_worker_id, { ...(cur ?? {}), ...a.p_fields, observed_at: a.p_observed_at, logout: a.p_logout });
      }
      return { error: null };
    },
  };
  return { db, admin };
}

function setup() {
  const { db, admin } = fakeDb();
  const h = makeHandler({
    admin: () => admin,
    verifyFirebaseToken: async (t) => (t === "good1" ? "uidOne" : t === "good2" ? "uidTwo" : t === "orphan" ? "uidNone" : null),
    now: () => NOW,
  });
  const call = (body: unknown, token: string | null = "good1") =>
    h(new Request("http://x", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: typeof body === "string" ? body : JSON.stringify(body),
    }));
  return { db, call };
}
const ev = (id: string, kind = "snapshot", at = "2026-10-22T11:00:00Z", data: any = {}) => ({ id, kind, observed_at: at, data });

describe("authentication", () => {
  test("no token → 401", async () => { expect((await setup().call({ events: [] }, null)).status).toBe(401); });
  test("invalid token → 401", async () => { expect((await setup().call({ events: [] }, "bad")).status).toBe(401); });
  test("valid token without worker → 403", async () => { expect((await setup().call({ events: [ev("a")] }, "orphan")).status).toBe(403); });
  test("client-supplied worker_id is ignored", async () => {
    const { db, call } = setup();
    await call({ worker_id: W2, events: [ev("a")] }, "good1");
    expect(db.events[0].worker_id).toBe(W1);
  });
});

describe("synchronization", () => {
  test("stores events and confirms ids", async () => {
    const { db, call } = setup();
    const r = await (await call({ events: [ev("a"), ev("b", "network_lost")] })).json();
    expect(r.acceptedIds).toEqual(["a", "b"]);
    expect(db.events.length).toBe(2);
  });
  test("duplicate reports are not stored twice and still confirmed", async () => {
    const { db, call } = setup();
    await call({ events: [ev("a", "snapshot", "2026-10-22T11:00:00Z", { network: "online" })] });
    const r = await (await call({ events: [ev("a", "snapshot", "2026-10-22T11:00:00Z", { network: "no_internet" })] })).json();
    expect(r.acceptedIds).toEqual(["a"]);
    expect(db.events.length).toBe(1);
    expect(db.events[0].data.network).toBe("online");
  });
  test("delayed older snapshot never overwrites newer status", async () => {
    const { db, call } = setup();
    await call({ events: [ev("new", "snapshot", "2026-10-22T11:30:00Z", { network: "online" })] });
    await call({ events: [ev("old", "snapshot", "2026-10-22T10:00:00Z", { network: "no_internet" })] });
    expect(db.status.get(W1).network).toBe("online");
    expect(db.status.get(W1).observed_at).toBe("2026-10-22T11:30:00.000Z");
  });
  test("only the newest snapshot in a batch updates status", async () => {
    const { db, call } = setup();
    await call({ events: [ev("b", "snapshot", "2026-10-22T11:10:00Z", { slot_state: "current_selected" }), ev("a", "snapshot", "2026-10-22T10:10:00Z", { slot_state: "none_configured" })] });
    expect(db.status.get(W1).slot_state).toBe("current_selected");
  });
  test("never touches workers availability, bookings or payouts", async () => {
    const { db, call } = setup();
    await call({ events: [ev("a", "explicit_logout")] });
    expect(db.workers[0].is_available).toBe(true);
    expect(new Set(db.calls)).toEqual(new Set(["workers", "worker_diagnostic_events", "upsert_worker_diagnostic_status"]));
  });
});

describe("error handling", () => {
  test("malformed JSON → 400", async () => { expect((await setup().call("{not json")).status).toBe(400); });
  test("more than 50 events → 400", async () => {
    expect((await setup().call({ events: Array.from({ length: 51 }, (_, i) => ev("e" + i)) })).status).toBe(400);
  });
  test("bad events rejected individually, good ones kept", async () => {
    const r = await (await setup().call({ events: [ev("ok"), ev("x", "hack"), ev("f", "snapshot", "2027-01-01T00:00:00Z")] })).json();
    expect(r.acceptedIds).toEqual(["ok"]);
    expect(r.rejected.map((x: any) => x.reason)).toEqual(["bad_kind", "time_out_of_range"]);
  });
  test("token-like strings are refused", () => {
    expect(validateEvent(ev("a", "snapshot", "2026-10-22T11:00:00Z", { fcm_token: "abc" }), NOW)).toBe("forbidden_key");
    expect(validateEvent(ev("a", "snapshot", "2026-10-22T11:00:00Z", { token_registered: true }), NOW)).toBeNull();
  });
  test("events older than 7 days rejected", () => {
    expect(validateEvent(ev("a", "snapshot", "2026-10-10T00:00:00Z"), NOW)).toBe("time_out_of_range");
  });
});

describe("compatibility", () => {
  test("Worker App event format (makeEvent output) is accepted", async () => {
    const r = await (await setup().call({ events: [{ id: "snapshot:2026-10-22T11:00:00.000Z", kind: "snapshot", observed_at: "2026-10-22T11:00:00.000Z", data: { network: "online", token_registered: true } }] })).json();
    expect(r.acceptedIds.length).toBe(1);
  });
  test("empty batch from older builds is harmless", async () => {
    expect((await (await setup().call({ events: [] })).json()).acceptedIds).toEqual([]);
  });
});
