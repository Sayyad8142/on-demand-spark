import { WORKER_BOOKING_COLUMNS } from "./workerBookingColumns";
import { isActiveWorkStatus } from "./workSafety";
import { isBeforeScheduledDispatchWindow } from "./scheduledBookingGuards";

type ActiveRow = { id: string; worker_id: string | null; status: string; updated_at?: string | null; booking_type?: string | null; scheduled_date?: string | null; scheduled_time?: string | null };
/** Strip sensitive fields from realtime rows before caching, just as the HTTP select does. */
export function workerVisibleBooking(row: Record<string, unknown>): Record<string, unknown> | null {
  if (typeof row.id !== "string" || typeof row.status !== "string") return null;
  return Object.fromEntries(WORKER_BOOKING_COLUMNS.split(",").filter(key => key in row).map(key => [key, row[key]]));
}

export function mergeActiveBooking<T extends ActiveRow>(current: T | null, incoming: T, workerId: string): T | null {
  if (incoming.worker_id !== workerId) return current?.id === incoming.id ? null : current;
  if (current?.id === incoming.id && Date.parse(current.updated_at ?? "") > Date.parse(incoming.updated_at ?? "")) return current;
  if (!isActiveWorkStatus(incoming.status) || (incoming.status === "assigned" && isBeforeScheduledDispatchWindow(incoming))) {
    return current?.id === incoming.id ? null : current;
  }
  return incoming;
}