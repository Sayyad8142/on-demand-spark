/**
 * Mandatory availability rules (display/gating only — the server stays the
 * final authority once its own check is approved).
 *
 * A "valid slot" is a real start time on the existing 30-minute grid
 * 07:00–18:30 ("HH:MM" or "HH:MM:SS"). Placeholder values such as "false"
 * written by the old signup seeding never count.
 */
const SLOT_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function isValidSlot(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const m = SLOT_RE.exec(value.trim());
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = m[3] === undefined ? 0 : Number(m[3]);
  if (sec !== 0 || (min !== 0 && min !== 30)) return false;
  return h >= 7 && h <= 18;
}

export type AvailabilityRow = { slots?: unknown } | null | undefined;

export function countValidSlots(rows: AvailabilityRow[] | null | undefined): number {
  if (!Array.isArray(rows)) return 0;
  let n = 0;
  for (const row of rows) {
    const slots = row?.slots;
    if (Array.isArray(slots)) n += slots.filter(isValidSlot).length;
  }
  return n;
}

export function hasValidSlots(rows: AvailabilityRow[] | null | undefined): boolean {
  return countValidSlots(rows) > 0;
}

/** Turning ON is allowed only with at least one valid saved slot. Turning OFF is always allowed. */
export function canTurnOn(nextValue: boolean, savedRows: AvailabilityRow[] | null | undefined): boolean {
  if (!nextValue) return true;
  return hasValidSlots(savedRows);
}

/** Saving with zero selected slots is never accepted. */
export function canSaveSelection(selectedCount: number): boolean {
  return Number.isFinite(selectedCount) && selectedCount > 0;
}

/**
 * Send the worker to the slots screen automatically only when they have no
 * valid slots, aren't already there or on an essential screen, and haven't
 * been sent this session (prevents redirect loops).
 */
const NO_REDIRECT_PREFIXES = ["/availability", "/profile", "/support", "/auth", "/otp", "/signup", "/help", "/call"];

export function shouldRedirectToSetup(opts: {
  hasSlots: boolean | null;
  pathname: string;
  alreadyRedirected: boolean;
  isGuest?: boolean;
}): boolean {
  if (opts.isGuest) return false;
  if (opts.hasSlots !== false) return false; // unknown (loading/error) never redirects
  if (opts.alreadyRedirected) return false;
  return !NO_REDIRECT_PREFIXES.some((p) => opts.pathname.startsWith(p));
}
