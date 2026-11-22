/** Proposed read-only endpoint extension. Never sorts workers or computes eligibility/groups. */
export type DispatchPositionStatus = "offer_sent" | "next_batch" | "in_line" | "not_eligible" | "updating";
export interface DispatchPerson { name: string; isMe: boolean }
export interface DispatchBatch { number: number; size: number; workers: DispatchPerson[] }
export interface DispatchOffer extends DispatchPerson { sentAt: string; expiresAt: string; receivedAt: string | null }
export interface LiveDispatchView {
  ruleRevision: string;
  status: DispatchPositionStatus;
  ownGroup: number | null;
  batches: DispatchBatch[];
  offers: DispatchOffer[];
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const time = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const person = (v: unknown): DispatchPerson => {
  if (!record(v) || typeof v.display_name !== "string" || !v.display_name.trim() || v.display_name.length > 80 || typeof v.is_me !== "boolean") throw Error("invalid_person");
  // Server-authorized display names only; no IDs, phone, photo, address or token copied.
  return { name: v.display_name, isMe: v.is_me };
};

/** Unknown/legacy/malformed extensions never authorize a live position. */
export function parseLiveDispatchView(input: unknown, now = Date.now()): LiveDispatchView | null {
  try {
    if (!record(input) || input.contract_version !== 1 || input.production_rules_verified !== true ||
      typeof input.rule_revision !== "string" || !/^[a-z0-9._-]{1,100}$/i.test(input.rule_revision) ||
      !["offer_sent", "next_batch", "in_line", "not_eligible", "updating"].includes(String(input.own_status)) ||
      !Array.isArray(input.batches) || input.batches.length > 30 || !Array.isArray(input.offers) || input.offers.length > 50) return null;
    const status = input.own_status as DispatchPositionStatus;
    const group = input.own_group;
    if (group !== null && !integer(group, 1, 100000)) return null;
    if ((status === "next_batch" && group !== 1) || (status === "in_line" && (!integer(group, 2, 100000))) ||
      (["not_eligible", "updating", "offer_sent"].includes(status) && group !== null)) return null;
    const batches = input.batches.map((b): DispatchBatch => {
      if (!record(b) || !integer(b.group_number, 1, 100000) || !integer(b.configured_size, 1, 50) ||
        !Array.isArray(b.workers) || b.workers.length > b.configured_size) throw Error("invalid_batch");
      return { number: b.group_number, size: b.configured_size, workers: b.workers.map(person) };
    });
    if (new Set(batches.map(b => b.number)).size !== batches.length) return null;
    const offers = input.offers.map((o): DispatchOffer => {
      if (!record(o) || !time(o.sent_at) || !time(o.expires_at) || Date.parse(o.sent_at) > now || Date.parse(o.expires_at) <= now ||
        Date.parse(o.expires_at) <= Date.parse(o.sent_at) || (o.phone_received_at !== null && (!time(o.phone_received_at) || Date.parse(o.phone_received_at) < Date.parse(o.sent_at) || Date.parse(o.phone_received_at) > now))) throw Error("invalid_offer");
      return { ...person(o), sentAt: o.sent_at, expiresAt: o.expires_at, receivedAt: typeof o.phone_received_at === "string" ? o.phone_received_at : null };
    });
    const ownBatch = batches.flatMap(b => b.workers.filter(w => w.isMe).map(() => b.number));
    const ownOffers = offers.filter(o => o.isMe);
    if (ownBatch.length > 1 || ownOffers.length > 1 ||
      (["not_eligible", "updating"].includes(status) && (ownBatch.length || ownOffers.length)) ||
      (status === "offer_sent" && (ownOffers.length !== 1 || ownBatch.length)) ||
      (["next_batch", "in_line"].includes(status) && (ownOffers.length || (ownBatch.length > 0 && ownBatch[0] !== group)))) return null;
    return { ruleRevision: input.rule_revision, status, ownGroup: group as number | null, batches, offers };
  } catch { return null; }
}

/** A sent offer/snapshot becoming stale must stop claiming a current queue position. */
export function dispatchViewFresh(snapshotAt: string, view: LiveDispatchView, now = Date.now()): boolean {
  const stamp = Date.parse(snapshotAt);
  return Number.isFinite(stamp) && now - stamp < 20_000 && stamp <= now + 5_000 && view.offers.every(o => Date.parse(o.expiresAt) > now);
}

export function dispatchAreaPresentation(area: { status: string; reason: string | null; dispatch?: LiveDispatchView | null }, snapshotAt: string, now = Date.now()): { status: DispatchPositionStatus; view: LiveDispatchView | null } {
  const stamp = Date.parse(snapshotAt);
  const updating = { status: "updating" as const, view: null };
  if (!Number.isFinite(stamp) || now - stamp >= 20_000 || stamp > now + 5_000) return updating;
  if (!["in_queue", "not_in_queue"].includes(area.status)) return updating;
  const excluded = area.status === "not_in_queue" || area.reason !== null;
  const view = area.dispatch && dispatchViewFresh(snapshotAt, area.dispatch, now) ? area.dispatch : null;
  if (excluded) return { status: "not_eligible", view: view?.status === "not_eligible" ? view : null };
  return view ? { status: view.status, view } : updating;
}