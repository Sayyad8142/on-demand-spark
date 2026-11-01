# Mandatory Availability — Database proposal (NOT APPLIED)

Status: draft for approval. Nothing below has been run. Worker App part is done separately (no publish).

## Audit results (read-only, main backend paywwbuqycovjopryele)

### Paths that can turn a worker ON — none check slots today
| Function | Who can run | Slot check |
|---|---|---|
| `set_worker_availability_manual` (used by edge fn `update-availability`) | service role | No |
| `set_worker_availability` | admin or service role | No |
| `watchdog_restore_worker_if_unchanged` | service role | No (checks busy/active/blocked only) |
| `admin_bulk_enable_worker_availability` | admin | No (checks community, service, push, heartbeat, busy, bookings) |
| `admin_emergency_undo_pauses` | service role | No (restores previous value) |

### Booking-alert functions
- `get_workers_for_notification`, `simple_assign_to_next_worker`: no slot filter, but no callers found in the database or in this project's server function code. They look unused. Live server function code NOT VERIFIED.
- `get_eligible_workers` (main dispatch) already matches exact slots, so a worker with no real slots can't be offered a booking there.

### Signup triggers that create slots (on insert into `workers`)
1. `auto_seed_worker_availability` → `trigger_seed_worker_availability()` → `seed_worker_availability(id)`: writes 7 rows of 26 `"false"` strings (broken placeholders). Runs first.
2. `trg_auto_create_worker_availability` → `auto_create_worker_availability_slots()`: 07:00–18:30 every day, `ON CONFLICT DO NOTHING`, so it is skipped when trigger 1 already wrote rows.
Both fire only on INSERT, so removing them can't touch existing workers' rows.

### Placeholder vs real slot
Real = matches `^\d{2}:(00|30)(:00)?$` with hour 07–18 (the app's grid). Anything else (`"false"`, `"true"`, other times) is ignored. Same rule as `src/lib/availabilityGate.ts`.

Live counts: 39 workers; 1 has only placeholder slots (currently OFF); 15 ON, all with real slots.

## Migration (proposed)
```sql
CREATE OR REPLACE FUNCTION public.worker_has_valid_slots(p_worker_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.worker_availability a, unnest(a.slots) s
    WHERE a.worker_id = p_worker_id
      AND s ~ '^(0[7-9]|1[0-8]):(00|30)(:00)?$')
$$;
REVOKE EXECUTE ON FUNCTION public.worker_has_valid_slots(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_has_valid_slots(uuid) TO authenticated, service_role;

-- Block only OFF->ON transitions. Never touches a row that isn't switching ON.
CREATE OR REPLACE FUNCTION public.enforce_slots_before_available()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_available IS TRUE AND COALESCE(OLD.is_available, false) IS FALSE
     AND NOT public.worker_has_valid_slots(NEW.id) THEN
    NEW.is_available := false;  -- stays OFF; caller sees is_available=false
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_enforce_slots_before_available
  BEFORE UPDATE OF is_available ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_slots_before_available();

-- Clear answer for the Worker App switch.
-- (inside set_worker_availability_manual, before the UPDATE)
--   IF p_is_available AND NOT public.worker_has_valid_slots(p_worker_id) THEN
--     RETURN jsonb_build_object('success', false, 'error', 'NO_AVAILABILITY_SLOTS');
--   END IF;

-- Turn OFF when the last real slot is removed (fires only on slot edits).
CREATE OR REPLACE FUNCTION public.off_when_no_slots()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := COALESCE(NEW.worker_id, OLD.worker_id);
BEGIN
  IF NOT public.worker_has_valid_slots(v_id) THEN
    PERFORM set_config('app.availability_source', 'system', true);
    PERFORM set_config('app.availability_reason', 'no_availability_slots', true);
    UPDATE public.workers SET is_available = false, updated_at = now()
     WHERE id = v_id AND is_available = true;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_off_when_no_slots
  AFTER INSERT OR UPDATE OF slots OR DELETE ON public.worker_availability
  FOR EACH ROW EXECUTE FUNCTION public.off_when_no_slots();

-- Stop auto-creating slots at signup (functions kept for rollback).
DROP TRIGGER auto_seed_worker_availability ON public.workers;
DROP TRIGGER trg_auto_create_worker_availability ON public.workers;
```
No existing `worker_availability` rows are inserted, changed or deleted.

## Rollback
```sql
DROP TRIGGER IF EXISTS trg_enforce_slots_before_available ON public.workers;
DROP TRIGGER IF EXISTS trg_off_when_no_slots ON public.worker_availability;
DROP FUNCTION IF EXISTS public.enforce_slots_before_available();
DROP FUNCTION IF EXISTS public.off_when_no_slots();
DROP FUNCTION IF EXISTS public.worker_has_valid_slots(uuid);
CREATE TRIGGER auto_seed_worker_availability AFTER INSERT ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.trigger_seed_worker_availability();
CREATE TRIGGER trg_auto_create_worker_availability AFTER INSERT ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_worker_availability_slots();
-- + restore original set_worker_availability_manual body (saved before applying).
```
NOTE: trigger timing (AFTER INSERT) is assumed; confirm from `pg_get_triggerdef` before applying.

## Can it switch existing workers ON or OFF by itself?
- ON: never. No path sets true.
- OFF on apply: no. Triggers only react to future updates. The 15 ON workers all have real slots.
- OFF later: only when a worker's slot edit leaves zero real slots (intended), or an OFF→ON attempt without slots (stays OFF).
- Assigned bookings, OTP, payments, payouts: not touched.

## Tests to run after approval (on the live DB, with rollback ready)
1. Worker with real slots: OFF→ON allowed.
2. Placeholder-only worker: OFF→ON stays OFF, manual RPC returns NO_AVAILABILITY_SLOTS.
3. ON worker clears last slot → OFF; assigned bookings unchanged.
4. Counts of ON workers before/after apply identical (15).
5. New test signup gets no slot rows.

## Edge function follow-up (separate approval, auto-deploys)
`update-availability`: return `{error:"NO_AVAILABILITY_SLOTS"}` with 400 instead of generic `update_failed`. The app already handles any error by staying OFF.
