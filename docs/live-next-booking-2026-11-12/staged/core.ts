// Independent read-only display ranking. Never imported by dispatch.
export interface Candidate {
  id: string; full_name: string | null; priority_score: number | null; rating: number | null;
  is_active: boolean | null; is_blocked: boolean | null; is_available: boolean | null; is_busy: boolean | null;
  communities: string[] | null; service_types: string[] | null;
}
export interface Availability { worker_id: string; day_of_week: number; slots: string[] | null }
export function slotAt(now: number) {
  const india = new Date(now + 330 * 60_000);
  const start = Math.floor(now / 1_800_000) * 1_800_000;
  return { start, end: start + 1_800_000, day: india.getUTCDay(),
    key: `${String(india.getUTCHours()).padStart(2, "0")}:${india.getUTCMinutes() < 30 ? "00" : "30"}:00` };
}
export function availabilityReason(w: Candidate, slots: Availability[], busy: Set<string>, community: string, service: string, now: number) {
  if ([w.is_active, w.is_blocked, w.is_available, w.is_busy].some(v => typeof v !== "boolean") ||
      !Array.isArray(w.communities) || !Array.isArray(w.service_types) || !w.communities.includes(community) || !w.service_types.includes(service)) return "unable";
  if (!w.is_active || w.is_blocked) return "inactive";
  if (!w.is_available) return "off";
  if (w.is_busy || busy.has(w.id)) return "busy";
  const slot = slotAt(now);
  if (!slots.some(s => s.worker_id === w.id && s.day_of_week === slot.day && s.slots?.includes(slot.key))) return "no_slot";
  if (w.priority_score === null || !Number.isFinite(w.priority_score) || w.rating === null || !Number.isFinite(w.rating) || w.rating < 0 || w.rating > 5) return "unable";
  return "available";
}
export function snapshot(me: Candidate, workers: Candidate[], slots: Availability[], busy: Set<string>, community: string, service: string, communities: string[], services: string[], now: number) {
  const slot = slotAt(now);
  const sorted = workers.filter(w => availabilityReason(w, slots, busy, community, service, now) === "available")
    .sort((a, b) => Number(b.priority_score) - Number(a.priority_score) || Number(b.rating) - Number(a.rating) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { version: 1, updatedAt: new Date(now).toISOString(), slotStart: new Date(slot.start).toISOString(), slotEnd: new Date(slot.end).toISOString(),
    community, service, communities, services, reason: availabilityReason(me, slots, busy, community, service, now),
    rows: sorted.map((w, index) => ({ rank: index + 1,
      // First name only; no worker/user IDs, contact fields or schedules in response.
      name: w.full_name?.trim().split(/\s+/)[0]?.slice(0, 80) || "Worker", priority: Number(w.priority_score), rating: Number(w.rating), isMe: w.id === me.id })) };
}