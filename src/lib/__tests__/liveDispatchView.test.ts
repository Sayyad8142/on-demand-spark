import { describe, expect, it } from "vitest";
import { dispatchAreaPresentation, dispatchViewFresh, parseLiveDispatchView } from "../liveDispatchView";
import { parseWorkerNextBooking } from "../workerNextBooking";
const now = Date.parse("2026-11-22T04:40:54Z");
const sent = "2026-11-22T04:40:53.108Z";
const expires = "2026-11-22T04:41:53.108Z";
const worker = (display_name: string, is_me = false) => ({ display_name, is_me });
const names = ["Anusha m", "Kethavath mounika", "Nagarani m", "Jyothi G", "Kalyani sapavath"];
const view = () => ({ contract_version: 1, production_rules_verified: true, rule_revision: "verified-fixture-only",
  own_status: "next_batch", own_group: 1,
  offers: names.map(name => ({ ...worker(name), sent_at: sent, expires_at: expires, phone_received_at: null })),
  batches: [{ group_number: 1, configured_size: 5, workers: [worker("Sid", true), worker("Kaveri vadde"), worker("Kavitha vadde")] }],
});
describe("read-only live dispatch projection — proposed contract", () => {
  it("preserves Sid's five recorded offers and three remaining workers in server order", () => {
    const result = parseLiveDispatchView(view(), now);
    expect(result?.offers.map(o => o.name)).toEqual(names);
    expect(result?.batches[0].workers.map(w => w.name)).toEqual(["Sid", "Kaveri vadde", "Kavitha vadde"]);
    expect(result?.batches[0].size).toBe(5);
    expect(result?.ownGroup).toBe(1);
  });
  it("uses configured sizes, not a client hardcoded five or score sorting", () => {
    const input = view(); input.batches[0].configured_size = 3;
    expect(parseLiveDispatchView(input, now)?.batches[0].size).toBe(3);
  });
  it("keeps provider/offer send distinct from phone receipt", () => {
    expect(parseLiveDispatchView(view(), now)?.offers.every(o => o.receivedAt === null)).toBe(true);
    const input = view();
    const result = parseLiveDispatchView({ ...input, offers: [{ ...input.offers[0], phone_received_at: "2026-11-22T04:40:53.500Z", fcm_accepted: true }] }, now);
    expect(result?.offers[0].receivedAt).toBe("2026-11-22T04:40:53.500Z");
  });
  it("unverified/legacy/malformed positions stay unknown, never next", () => {
    expect(parseLiveDispatchView({ groups_ahead: 0 }, now)).toBeNull();
    expect(parseLiveDispatchView({ ...view(), production_rules_verified: false }, now)).toBeNull();
    expect(parseLiveDispatchView({ ...view(), own_status: "next_batch", own_group: 2 }, now)).toBeNull();
  });
  it("an unavailable worker can be Not Eligible but cannot be present in the queue", () => {
    expect(parseLiveDispatchView({ ...view(), own_status: "not_eligible", own_group: null }, now)).toBeNull();
    expect(parseLiveDispatchView({ ...view(), own_status: "not_eligible", own_group: null, batches: [] }, now)?.status).toBe("not_eligible");
  });
  it("copies only allowed display fields, not private IDs, tokens, phones or scores", () => {
    const input = view();
    const result = parseLiveDispatchView({ ...input, batches: [{ ...input.batches[0], workers: [{ ...worker("Sid", true), phone: "private", worker_id: "private", priority_score: 999, ack_token: "private" }] }] }, now);
    expect(result?.batches[0].workers).toEqual([{ name: "Sid", isMe: true }]);
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("expired recorded offers invalidate the view rather than claim a current Offer Sent", () => {
    expect(parseLiveDispatchView(view(), Date.parse(expires))).toBeNull();
    const result = parseLiveDispatchView(view(), now);
    if (!result) throw Error("fixture invalid");
    expect(dispatchViewFresh(sent, result, now)).toBe(true);
    expect(dispatchViewFresh(sent, result, now + 20000)).toBe(false);
    expect(dispatchViewFresh(expires, result, Date.parse(expires))).toBe(false);
  });
  it("legacy endpoint still parses but carries no verified named dispatch view", () => {
    const input = { ok: true, estimate_only: true, snapshot_at: sent, ranking_mode: "longest_waiting", areas: [{ community: "prestige-high-fields", service: "maid", status: "in_queue", reason: null, groups_ahead: 0 }] };
    expect(parseWorkerNextBooking(input, now).areas[0].dispatch).toBeNull();
    expect(parseWorkerNextBooking({ ...input, areas: [{ ...input.areas[0], dispatch_view: view() }] }, now).areas[0].dispatch?.ownGroup).toBe(1);
  });
  it("an unknown/legacy position displays updating and excluded workers never display next", () => {
    const area = { status: "in_queue", reason: null, dispatch: parseLiveDispatchView(view(), now) };
    expect(dispatchAreaPresentation(area, sent, now).status).toBe("next_batch");
    expect(dispatchAreaPresentation({ ...area, dispatch: null }, sent, now)).toEqual({ status: "updating", view: null });
    expect(dispatchAreaPresentation({ ...area, reason: "availability_off" }, sent, now)).toEqual({ status: "not_eligible", view: null });
    expect(dispatchAreaPresentation({ ...area, status: "unknown" }, sent, now)).toEqual({ status: "updating", view: null });
    expect(dispatchAreaPresentation(area, sent, now + 20000)).toEqual({ status: "updating", view: null });
  });
});