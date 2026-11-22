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
  // Existing RPC caps both arrays at 20: refuse potentially truncated history.
  if (input.runs.length >= 20 || input.requests.length >= 20) throw Error("incomplete_audit");
  if (!input.runs.every(record) || !input.requests.every(record)) throw Error("unverified_audit");
  const runs = input.runs.map(r => ({
    attempt: integer(r.attempt_number), start: timestamp(r.started_at),
    eligible: integer(r.workers_eligible), selected: integer(r.workers_selected),
  })).filter(r => r.attempt !== null && r.attempt > 0 && r.start !== null)
    .sort((a, b) => Date.parse(a.start ?? "") - Date.parse(b.start ?? ""));
  const offers: RecordedOffer[] = input.requests.map(r => {
    const offeredAt = timestamp(r.offered_at), sequence = integer(r.order_sequence);
    if (!offeredAt || sequence === null || typeof r.worker_id !== "string" || typeof r.status !== "string") throw Error("unverified_request");
    return { workerId: r.worker_id, workerName: typeof r.worker_name === "string" ? r.worker_name : "Worker",
      status: r.status, offeredAt, timeoutAt: timestamp(r.timeout_at), sequence };
  }).sort((a, b) => a.sequence - b.sequence || Date.parse(a.offeredAt) - Date.parse(b.offeredAt));
  // The RPC exposes no request-to-run foreign key. Associate only when exactly
  // one run is within two seconds; fail closed on overlaps or distant requests.
  // These are timestamp-associated runs, not a verified future queue.
  const waves: RecordedWave[] = runs.map(r => ({ attempt: r.attempt ?? 0, eligible: r.eligible, selected: r.selected, offers: [] }));
  for (const offer of offers) {
    const time = Date.parse(offer.offeredAt);
    const matches = runs.map((r, i) => ({ i, t: Date.parse(r.start ?? "") })).filter(r => Math.abs(r.t - time) <= 2000);
    const matching = matches[0];
    if (matches.length !== 1 || !matching) throw Error("unmatched_request");
    waves[matching.i]?.offers.push(offer);
  }
  if (waves.some(w => w.selected !== null && w.selected !== w.offers.length)) throw Error("incomplete_audit");
  return waves;
}