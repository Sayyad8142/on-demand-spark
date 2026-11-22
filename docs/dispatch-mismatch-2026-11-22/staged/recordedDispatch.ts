// Admin-only read projection. No ordering, eligibility, dispatch or writes.
type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue => !!v && typeof v === "object" && !Array.isArray(v);
export interface RecordedOffer {
  workerName: string; workerId: string; status: string; offeredAt: string; timeoutAt: string | null; sequence: number;
}
export interface RecordedWave { attempt: number; eligible: number | null; selected: number | null; offers: RecordedOffer[] }
const integer = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
const timestamp = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;

/** Historical requests grouped by stored run time, not current worker score. */
export function recordedDispatch(input: unknown): RecordedWave[] {
  if (!record(input) || !Array.isArray(input.runs) || !Array.isArray(input.requests)) throw Error("unverified_audit");
  const runs = input.runs.filter(record).map(r => ({
    attempt: integer(r.attempt_number), start: timestamp(r.started_at),
    eligible: integer(r.workers_eligible), selected: integer(r.workers_selected),
  })).filter(r => r.attempt !== null && r.attempt > 0 && r.start !== null)
    .sort((a, b) => Date.parse(a.start ?? "") - Date.parse(b.start ?? ""));
  const offers: RecordedOffer[] = input.requests.filter(record).map(r => {
    const offeredAt = timestamp(r.offered_at), sequence = integer(r.order_sequence);
    if (!offeredAt || sequence === null || typeof r.worker_id !== "string" || typeof r.status !== "string") throw Error("unverified_request");
    return { workerId: r.worker_id, workerName: typeof r.worker_name === "string" ? r.worker_name : "Worker",
      status: r.status, offeredAt, timeoutAt: timestamp(r.timeout_at), sequence };
  }).sort((a, b) => a.sequence - b.sequence || Date.parse(a.offeredAt) - Date.parse(b.offeredAt));
  // Request creation can precede run creation by milliseconds. Match the closest
  // run at/before the offer, allowing only a 2-second lead, never inventing an order.
  const waves: RecordedWave[] = runs.map(r => ({ attempt: r.attempt ?? 0, eligible: r.eligible, selected: r.selected, offers: [] }));
  for (const offer of offers) {
    const time = Date.parse(offer.offeredAt);
    const matches = runs.map((r, i) => ({ i, t: Date.parse(r.start ?? "") })).filter(r => r.t <= time + 2000);
    const matching = matches[matches.length - 1];
    if (!matching) throw Error("unmatched_request");
    waves[matching.i]?.offers.push(offer);
  }
  return waves;
}