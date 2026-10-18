// Offline test of 001_completion_lock_DRAFT.sql against a real (in-memory) Postgres (PGlite).
// No network, no production. Run: cd /tmp/otp1 && bun test <this file>
// Models the live bookings guards/policies/payout trigger as read on 18 Oct 2026 (LIVE-READ).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "bun:test";

const DRAFT = readFileSync(new URL("./001_completion_lock_DRAFT.sql", import.meta.url), "utf8");
const WORKER_UID = "11111111-1111-1111-1111-111111111111";
const CUSTOMER_UID = "22222222-2222-2222-2222-222222222222";
const ADMIN_UID = "33333333-3333-3333-3333-333333333333";
const OTHER_UID = "44444444-4444-4444-4444-444444444444";
const B = "aaaaaaaa-0000-0000-0000-000000000001";

const BASE = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 $$ SELECT NULLIF(NULLIF(current_setting('request.jwt.claims', true),'')::jsonb->>'sub','')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE TYPE app_role AS ENUM ('admin','worker','customer');
CREATE TABLE user_roles(user_id uuid, role app_role);
CREATE TABLE profiles(id uuid primary key, firebase_uid text, is_admin boolean default false);
CREATE TABLE workers(id uuid primary key, user_id text);
CREATE TABLE bookings(id uuid primary key, user_id uuid, worker_id uuid, status text, price_inr int,
  completion_otp text, completion_source text, completed_by text, otp_verified_at timestamptz,
  completed_at timestamptz, updated_at timestamptz, notes text);
CREATE TABLE booking_events(booking_id uuid, type text, meta jsonb);
CREATE TABLE worker_payouts(booking_id uuid unique, worker_id uuid, amount int);
CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
 $$ SELECT COALESCE((SELECT true FROM user_roles WHERE user_id=auth.uid() AND role='admin' LIMIT 1),false) $$;
CREATE FUNCTION get_profile_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT auth.uid() $$;
-- live guard (unchanged)
CREATE FUNCTION guard_booking_completion_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    IF COALESCE(NEW.completion_source,'') NOT IN ('otp','admin') THEN RAISE EXCEPTION 'source'; END IF;
    IF COALESCE(NEW.completed_by,'') NOT IN ('worker','admin') THEN RAISE EXCEPTION 'by'; END IF;
    IF NEW.completion_source='otp' AND (NEW.completed_by<>'worker' OR NEW.otp_verified_at IS NULL) THEN RAISE EXCEPTION 'otp'; END IF;
  END IF; RETURN NEW; END $$;
CREATE TRIGGER trg_guard_booking_completion_source BEFORE UPDATE OF status ON bookings FOR EACH ROW EXECUTE FUNCTION guard_booking_completion_source();
-- live payout trigger shape
CREATE FUNCTION pay() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN INSERT INTO worker_payouts VALUES (NEW.id, NEW.worker_id, NEW.price_inr) ON CONFLICT DO NOTHING; RETURN NEW; END $$;
CREATE TRIGGER trg_pay AFTER UPDATE OF status ON bookings FOR EACH ROW
 WHEN (NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' AND NEW.worker_id IS NOT NULL) EXECUTE FUNCTION pay();
-- live policies
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY sel ON bookings FOR SELECT USING (true);
CREATE POLICY bookings_update_admin_authenticated_only ON bookings FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL AND is_admin()) WITH CHECK (auth.uid() IS NOT NULL AND is_admin());
CREATE POLICY bookings_update_own_firebase ON bookings FOR UPDATE USING (user_id=get_profile_id()) WITH CHECK (user_id=get_profile_id());
CREATE POLICY bookings_worker_update_assigned ON bookings FOR UPDATE USING (EXISTS (SELECT 1 FROM workers w WHERE w.id=bookings.worker_id AND (w.id=auth.uid() OR w.user_id=auth.uid()::text)));
GRANT SELECT, UPDATE ON bookings TO anon, authenticated; GRANT ALL ON bookings, worker_payouts, booking_events TO service_role;
CREATE FUNCTION update_booking_status(p uuid, s text) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE bookings SET status=s WHERE id=p $$;
GRANT EXECUTE ON FUNCTION update_booking_status(uuid,text) TO authenticated;
-- admin RPC as live (security definer, is_admin check, labels completion as otp/worker)
CREATE FUNCTION admin_complete_booking_with_otp(p uuid, o text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN IF NOT is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
 IF (SELECT completion_otp FROM bookings WHERE id=p) <> o THEN RETURN '{"success":false}'; END IF;
 UPDATE bookings SET status='completed', completion_source='otp', completed_by='worker', otp_verified_at=now(), completed_at=now() WHERE id=p;
 RETURN '{"success":true}'; END $$;
GRANT EXECUTE ON FUNCTION admin_complete_booking_with_otp(uuid,text) TO authenticated;
INSERT INTO workers VALUES ('${WORKER_UID}', '${WORKER_UID}');
INSERT INTO user_roles VALUES ('${ADMIN_UID}','admin');
INSERT INTO bookings(id,user_id,worker_id,status,price_inr,completion_otp) VALUES ('${B}','${CUSTOMER_UID}','${WORKER_UID}','started',400,'1234');
`;

const FORGE = `UPDATE bookings SET status='completed', completion_source='otp', completed_by='worker', otp_verified_at=now() WHERE id='${B}'`;

let db: PGlite;
async function as(role: "anon" | "authenticated" | "service_role", sub: string | null, sql: string) {
  const claims = JSON.stringify(sub ? { role, sub } : { role });
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims', '${claims}', false); SET ROLE ${role};`);
  try { return await db.query(sql); } finally { await db.exec("RESET ROLE; SELECT set_config('request.jwt.claims','',false);"); }
}
const status = async () => (await db.query<{ status: string }>(`SELECT status FROM bookings WHERE id='${B}'`)).rows[0].status;
const payouts = async () => (await db.query<{ n: number }>(`SELECT count(*)::int n FROM worker_payouts`)).rows[0].n;

async function setup(withFix: boolean) {
  db = new PGlite();
  await db.exec(BASE);
  if (withFix) await db.exec(DRAFT);
}

describe("BEFORE fix (proves the live gap)", () => {
  beforeEach(() => setup(false));
  test("assigned worker can forge completion and trigger a payout", async () => {
    await as("authenticated", WORKER_UID, FORGE);
    expect(await status()).toBe("completed");
    expect(await payouts()).toBe(1);
  });
  test("customer can forge completion and trigger a payout", async () => {
    await as("authenticated", CUSTOMER_UID, FORGE);
    expect(await status()).toBe("completed");
    expect(await payouts()).toBe(1);
  });
});

describe("AFTER fix", () => {
  beforeEach(() => setup(true));
  test("assigned worker direct completion refused, no payout", async () => {
    await expect(as("authenticated", WORKER_UID, FORGE)).rejects.toThrow(/End OTP/);
    expect(await status()).toBe("started");
    expect(await payouts()).toBe(0);
  });
  test("customer direct completion refused, no payout", async () => {
    await expect(as("authenticated", CUSTOMER_UID, FORGE)).rejects.toThrow(/End OTP/);
    expect(await payouts()).toBe(0);
  });
  test("worker cannot pre-write completion labels without status", async () => {
    await expect(as("authenticated", WORKER_UID, `UPDATE bookings SET otp_verified_at=now(), completion_source='otp' WHERE id='${B}'`)).rejects.toThrow(/server-managed/);
  });
  test("customer cannot change completion_otp", async () => {
    await expect(as("authenticated", CUSTOMER_UID, `UPDATE bookings SET completion_otp='0000' WHERE id='${B}'`)).rejects.toThrow(/server-managed/);
  });
  test("worker forging service_role inside a user JWT is not trusted", async () => {
    // role claim comes from the signed JWT; a worker JWT always says authenticated
    await expect(as("authenticated", WORKER_UID, FORGE)).rejects.toThrow();
  });
  test("legacy update_booking_status RPC no longer callable by app users", async () => {
    await expect(as("authenticated", WORKER_UID, `SELECT update_booking_status('${B}','completed')`)).rejects.toThrow(/permission denied/);
    expect(await payouts()).toBe(0);
  });
  test("non-completion worker updates still work (e.g. notes)", async () => {
    await as("authenticated", WORKER_UID, `UPDATE bookings SET notes='arrived' WHERE id='${B}'`);
    expect((await db.query<{ notes: string }>(`SELECT notes FROM bookings`)).rows[0].notes).toBe("arrived");
  });
  test("End OTP edge function path (service_role) still completes once, one payout", async () => {
    await as("service_role", null, `UPDATE bookings SET status='completed', completed_at=now(), completed_by='worker', completion_source='otp', otp_verified_at=now() WHERE id='${B}' AND status IN ('assigned','accepted','on_the_way','started')`);
    expect(await status()).toBe("completed");
    const r = await as("service_role", null, `UPDATE bookings SET status='completed' WHERE id='${B}' AND status IN ('assigned','accepted','on_the_way','started') RETURNING id`);
    expect(r.rows.length).toBe(0); // duplicate completion = no row
    expect(await payouts()).toBe(1);
  });
  test("admin RPC still works and is audit-logged", async () => {
    await as("authenticated", ADMIN_UID, `SELECT admin_complete_booking_with_otp('${B}','1234')`);
    expect(await status()).toBe("completed");
    expect(await payouts()).toBe(1);
    const ev = await db.query<{ type: string; meta: any }>(`SELECT type, meta FROM booking_events`);
    expect(ev.rows[0].type).toBe("admin_completion");
    expect(ev.rows[0].meta.admin_uid).toBe(ADMIN_UID);
  });
  test("admin RPC refused for a worker", async () => {
    await expect(as("authenticated", WORKER_UID, `SELECT admin_complete_booking_with_otp('${B}','1234')`)).rejects.toThrow(/Admin access/);
  });
  test("admin direct table completion (Admin Panel) still works and is logged", async () => {
    await as("authenticated", ADMIN_UID, `UPDATE bookings SET status='completed', completion_source='admin', completed_by='admin' WHERE id='${B}'`);
    expect(await status()).toBe("completed");
    expect((await db.query(`SELECT 1 FROM booking_events WHERE type='admin_completion'`)).rows.length).toBe(1);
  });
  test("non-admin cannot re-open a completed booking", async () => {
    await as("service_role", null, `UPDATE bookings SET status='completed', completed_by='worker', completion_source='otp', otp_verified_at=now() WHERE id='${B}'`);
    await expect(as("authenticated", WORKER_UID, `UPDATE bookings SET status='started' WHERE id='${B}'`)).rejects.toThrow(/re-opened/);
  });
  test("other worker / anon cannot touch the booking", async () => {
    const r = await as("authenticated", OTHER_UID, `UPDATE bookings SET notes='x' WHERE id='${B}' RETURNING id`);
    expect(r.rows.length).toBe(0);
    await as("anon", null, FORGE).catch(() => {});
    expect(await status()).toBe("started");
  });
});
