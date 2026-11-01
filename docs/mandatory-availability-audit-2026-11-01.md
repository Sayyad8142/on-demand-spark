# Mandatory Availability — Audit (read-only, 2026-11-01)

Nothing changed, deployed or published.

## Root cause
1. **Slots are auto-filled at signup (DB).** Two triggers on `workers` insert run when a worker is created:
   - `auto_seed_worker_availability` → `seed_worker_availability()` inserts 7 rows of `ARRAY_FILL(false, 26)` into a `text[]` column, i.e. 26 junk `"false"` strings per day. Runs first (alphabetical).
   - `trg_auto_create_worker_availability` → full 07:00–18:30 every day (`ON CONFLICT DO NOTHING`, so it's skipped when the first trigger already wrote rows).
   Result: no worker ever has "zero slot rows". Live: 39/39 workers have non-empty slot arrays; 1 worker has only junk `"false"` values.
2. **App pre-selects every slot** for a first-time worker (`Availability.tsx` loadAvailability, "select all by default") — matches the saved project rule "First-time users get all time slots pre-selected", which this brief reverses.
3. **ON path never checks slots.** `AvailabilityToggle` → edge fn `update-availability` → `set_worker_availability_manual` sets `is_available` with no slot check. No trigger on `workers` blocks it.
4. **Clearing all slots is allowed** (upsert of empty arrays) and nothing turns the worker OFF.

Live: 15 workers ON, 0 of them without real slots. So nobody is wrongly ON today.

## Paths that can set is_available = true
| Path | Slot check |
|---|---|
| update-availability → set_worker_availability_manual | No |
| set_worker_availability (authenticated can execute) | references slots — NOT VERIFIED as a block |
| watchdog_restore_worker_if_unchanged | No |
| admin_bulk_enable_worker_availability | references slots — NOT VERIFIED |
| admin_emergency_undo_pauses | No |
| Direct table update | depends on workers RLS — NOT VERIFIED |
Dispatch: `get_eligible_workers` reads slots (exact-slot match); `get_workers_for_notification`, `simple_assign_to_next_worker` don't read slots — NOT VERIFIED whether they rely on an upstream filter.

## Proposed minimal change
**Database (needs approval — production):**
- `public.worker_has_valid_slots(uuid)` — true only if any slot matches `^\d\d:\d\d(:\d\d)?$` within the existing 07:00–19:00 grid.
- `BEFORE UPDATE OF is_available` trigger on `workers`: if NEW true and no valid slots → force false (covers every path: edge fn, RPCs, watchdog, admin, old apps, direct updates). `set_worker_availability_manual` returns `{success:false, error:'NO_AVAILABILITY_SLOTS'}` up front so the app gets a clear answer.
- `AFTER INSERT/UPDATE/DELETE` trigger on `worker_availability`: when a worker's last valid slot goes, set `is_available=false` (source `system`, reason `no_slots`). Assigned bookings untouched.
- Drop both auto-seed triggers on `workers` (new workers start with no slots). Existing rows unchanged.
- Dispatch: add `worker_has_valid_slots` to `get_workers_for_notification` only if read shows it lacks a slot filter (separate approval).

**Edge function `update-availability` (auto-deploys, needs approval):** pass through `NO_AVAILABILITY_SLOTS` as 400 instead of generic `update_failed`.

**Worker App (no deploy):**
- `AvailabilityToggle`: before ON, read own slots; if none → stay OFF, toast "Please select your available time slots before going online." + "Set Availability" action → `/availability`. Same on server `NO_AVAILABILITY_SLOTS`.
- New `src/lib/availabilityGate.ts` (pure): `hasValidSlots(rows)`, `needsAvailabilitySetup(rows)`; tests.
- App gate (after existing setup gate): zero valid slots → redirect once per session to `/availability?setup=1`; never from `/availability`, profile, support, auth routes (no loops).
- `Availability.tsx`: first-time = nothing pre-selected; welcome banner in setup mode; empty save → "Please select at least one time slot to continue."; existing workers may still clear (server then turns them OFF); save never turns ON.
- en/hi/te strings.

## Regression risks
- Older APKs: ON tap with no slots gets an error toast (server still blocks). Fine.
- Removing pre-select changes a saved rule — needs your confirmation.
- 1 worker with only junk slots will be unable to go ON until they save slots (currently OFF).
- OTP, payments, payouts, assignments: not touched.

## GO / NO-GO
GO for Worker App changes + tests (no deploy). GO for DB migration after your approval. NO-GO on publishing/APK until tested.
