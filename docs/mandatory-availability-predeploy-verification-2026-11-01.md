# Mandatory Availability — Pre-deployment verification (2026-11-01)

Status: NOTHING APPLIED TO LIVE. Read-only checks on main backend + full test on a throwaway local Postgres 17 copy of the relevant tables.

## 1. Backup
NOT VERIFIED. This project has no Supabase management access from here, so backup/PITR status cannot be read. Owner must confirm in Supabase dashboard → Database → Backups (and ideally download one) before apply.

## 2. Live state (read-only, verified)
- Workers 39; ON 15; ON without real slots 0.
- Placeholder-only worker: 033f9766-8363-4db0-bf46-5b02af67df00, OFF.
- Slot rows 273; fingerprint md5 3e08bd47cf7a0883840952c306960be8 (re-check after apply must match).
- ON-worker list fingerprint md5 24e4425117c51ab8e6973fd75d4d6897 (must match after apply).
- Signup triggers confirmed: both `AFTER INSERT ON workers FOR EACH ROW` (definitions captured; rollback recreates them exactly).
- worker_availability has CHECK array_length(slots,1)>0, so "no slots on a day" = row deleted. Trigger covers DELETE.
- Functions that can set is_available=true include set_worker_availability_manual, set_worker_availability, watchdog_restore_worker_if_unchanged, admin_bulk_enable_worker_availability, admin_emergency_undo_pauses, vr_setup, update_expert_availability, plus direct worker UPDATE allowed by RLS policy workers_update_own. All end in a row UPDATE on workers, so a row trigger covers every one of them.
- Existing BEFORE triggers on is_available: trg_log_availability_change, trg_workers_recompute_state. New trigger name sorts before both, so logs/state see the final value.

## 3. Changes vs. earlier draft (found during testing)
- Helper made VOLATILE (was STABLE): needed so the check re-reads after waiting for a lock.
- Slot trigger locks the worker row (FOR UPDATE) before checking: closes a race where ON and "remove last slot" happen at the same moment.
- ON-check also runs on INSERT (a worker created already ON is forced OFF).
- Slot trigger also fires on worker_id change.

## 4. Exact migration (for live; not applied)
```sql
BEGIN;
-- VOLATILE (not STABLE) so a fresh snapshot is taken after waiting on a row lock.
CREATE OR REPLACE FUNCTION public.worker_has_valid_slots(p_worker_id uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.worker_availability a, unnest(a.slots) s
    WHERE a.worker_id = p_worker_id AND s ~ '^(0[7-9]|1[0-8]):(00|30)(:00)?$')
$$;
REVOKE EXECUTE ON FUNCTION public.worker_has_valid_slots(uuid) FROM PUBLIC;

-- Fires on INSERT too (a row created already ON) and on every UPDATE of is_available.
CREATE OR REPLACE FUNCTION public.enforce_slots_before_available()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_available IS TRUE
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.is_available, false) IS FALSE)
     AND NOT public.worker_has_valid_slots(NEW.id) THEN
    NEW.is_available := false;
  END IF;
  RETURN NEW;
END $$;
-- Name sorts before trg_log_availability_change / trg_workers_recompute_state,
-- so logging and state recompute see the final value.
CREATE TRIGGER trg_enforce_slots_before_available
  BEFORE INSERT OR UPDATE OF is_available ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_slots_before_available();

CREATE OR REPLACE FUNCTION public.off_when_no_slots()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := COALESCE(NEW.worker_id, OLD.worker_id); v_on boolean;
BEGIN
  -- Lock the worker row first: serialises against a concurrent OFF->ON.
  SELECT is_available INTO v_on FROM public.workers WHERE id = v_id FOR UPDATE;
  IF v_on IS TRUE AND NOT public.worker_has_valid_slots(v_id) THEN
    PERFORM set_config('app.availability_source', 'system', true);
    PERFORM set_config('app.availability_reason', 'no_availability_slots', true);
    UPDATE public.workers SET is_available = false, updated_at = now() WHERE id = v_id AND is_available = true;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_off_when_no_slots
  AFTER INSERT OR UPDATE OF slots, worker_id OR DELETE ON public.worker_availability
  FOR EACH ROW EXECUTE FUNCTION public.off_when_no_slots();

DROP TRIGGER auto_seed_worker_availability ON public.workers;
DROP TRIGGER trg_auto_create_worker_availability ON public.workers;
COMMIT;
```

## 5. Exact rollback
```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_enforce_slots_before_available ON public.workers;
DROP TRIGGER IF EXISTS trg_off_when_no_slots ON public.worker_availability;
DROP FUNCTION IF EXISTS public.enforce_slots_before_available();
DROP FUNCTION IF EXISTS public.off_when_no_slots();
DROP FUNCTION IF EXISTS public.worker_has_valid_slots(uuid);
CREATE TRIGGER auto_seed_worker_availability AFTER INSERT ON public.workers FOR EACH ROW EXECUTE FUNCTION public.trigger_seed_worker_availability();
CREATE TRIGGER trg_auto_create_worker_availability AFTER INSERT ON public.workers FOR EACH ROW EXECUTE FUNCTION public.auto_create_worker_availability_slots();
COMMIT;
```

## 6. Throwaway database test — 27/27 PASS
Apply: slots unchanged (hash), same 15 ON (hash), placeholder worker OFF, bookings/OTP untouched, priorities untouched.
Rules: signup creates 0 slot rows; signup inserted ON → OFF; manual ON with no slots → OFF; placeholder-only ON → OFF; adding a slot never turns ON; ON with valid slot → ON; last slot replaced by junk → OFF; last slot row deleted → OFF; auto-OFF logged with final value; bulk ON skips no-slot workers; emergency undo/restore-all brings back only workers with slots; ON worker reducing slots stays ON.
Concurrency: delete-last-slot vs ON in both orders → ends OFF.
Other: worker delete cascade works. Rollback removes everything, restores signup seeding (7 rows) and old behaviour; re-apply after rollback works.
Limits: test copy has only the relevant tables/triggers, not the full live schema; payments/payouts/dispatch tables not modelled (migration does not reference them). Not tested against live data.

## 7. Production impact
- On apply: no row is inserted, updated or deleted. Nobody turns ON or OFF.
- After: ON attempts without real slots silently stay OFF. `set_worker_availability_manual` and admin bulk/restore functions will still report "success" while the worker stays OFF — admin screens may look misleading until those functions return a clear NO_AVAILABILITY_SLOTS (separate approved change).
- Worker App 10.0.03 already blocks ON without slots; older phone versions will see the switch flip back OFF.
- Cannot be bypassed by API/RLS paths. Only a database superuser (disabling triggers) could bypass.

## 8. Recommendation
NO-GO for production today, only because the backup is unconfirmed.
GO once: (1) owner confirms a restorable backup, (2) apply in a quiet hour, re-check both fingerprints + 15 ON + placeholder OFF, rollback ready.
Optional follow-up (separate GO): clear NO_AVAILABILITY_SLOTS answer in set_worker_availability_manual and the update-availability server function.
