import type { NextBookingDiagnostic } from "@/lib/nextBookingDiagnostic";

// Temporary preview-only check. English only on purpose: it is a tester tool, not worker copy.
export default function NextBookingDiagnosticPanel({ diagnostic, loading }: { diagnostic: NextBookingDiagnostic; loading: boolean }) {
  const d = diagnostic;
  const yes = (v: boolean | null) => v === null ? "Not checked yet" : v ? "YES" : "NO";
  const api = d.httpStatus === null ? null : d.httpStatus === 200;
  const ranking = d.contract === null ? null : d.contract === "valid";
  return <aside className="rounded-lg border border-dashed border-border bg-muted p-3 text-xs" aria-label="Preview check">
    <p className="mb-2 font-bold">Preview check (testing only{loading ? " · checking…" : ""})</p>
    <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
      <dt>Signed in as worker</dt><dd className="font-semibold">{yes(d.signedIn)}</dd>
      <dt>Server answered OK</dt><dd className="font-semibold">{yes(api)}{d.httpStatus !== null && ` (HTTP ${d.httpStatus})`}</dd>
      <dt>Valid ranking data</dt><dd className="font-semibold">{yes(ranking)}{d.contract === "different" && " (different format)"}</dd>
      {d.safeError && <><dt>Error</dt><dd className="font-semibold break-all">{d.safeError}</dd></>}
    </dl>
    {d.numbers.length > 0 && <div className="mt-2"><p className="font-semibold">Numbers returned</p><ul className="break-all">{d.numbers.map(n => <li key={n}>{n}</li>)}</ul></div>}
    {d.shape.length > 0 && <details className="mt-2"><summary className="cursor-pointer font-semibold">Response fields</summary><ul className="break-all">{d.shape.map(n => <li key={n}>{n}</li>)}</ul></details>}
  </aside>;
}
