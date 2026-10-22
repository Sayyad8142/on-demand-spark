/**
 * Local diagnostic queue for Worker Focus.
 *
 * Events are saved on the phone (survive no-internet) and flushed when the
 * connection returns. The server sender is OFF until the backend receiver in
 * docs/worker-focus-diagnostics-handoff-2026-10-22.md is approved and
 * deployed — until then events only stay on the phone (bounded, deduped).
 * Never contains tokens or credentials (see makeEvent).
 */
import { enqueue, makeEvent, type DiagnosticEvent, type DiagnosticKind } from "./workerDiagnostics";

const KEY = "worker_diagnostics_queue_v1";

/** Flip only after the backend receiver is approved and deployed. */
export const DIAGNOSTICS_SERVER_SYNC_ENABLED = false;

export type DiagnosticsSender = (events: DiagnosticEvent[]) => Promise<{ acceptedIds: string[] }>;

function read(): DiagnosticEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function write(q: DiagnosticEvent[]) {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* storage full: drop */ }
}

export function recordDiagnostic(kind: DiagnosticKind, data: DiagnosticEvent["data"] = {}, now = Date.now()): DiagnosticEvent {
  const ev = makeEvent(kind, data, now);
  write(enqueue(read(), ev));
  return ev;
}

export function pendingDiagnostics(): DiagnosticEvent[] { return read(); }

let flushing = false;
/** Sends queued events; removes only the ones the server confirmed. Never throws. */
export async function flushDiagnostics(sender: DiagnosticsSender | null): Promise<number> {
  if (!sender || flushing) return 0;
  const q = read();
  if (q.length === 0) return 0;
  flushing = true;
  try {
    const { acceptedIds } = await sender(q);
    const ok = new Set(acceptedIds);
    write(read().filter((e) => !ok.has(e.id)));
    return ok.size;
  } catch {
    return 0;
  } finally {
    flushing = false;
  }
}

/** Logout clears the queue so the next worker on this phone never sends someone else's events. */
export function clearDiagnostics() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
