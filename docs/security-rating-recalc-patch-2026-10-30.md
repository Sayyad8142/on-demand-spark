# Rating recalculation fix — PREPARED, NOT APPLIED (2026-10-30)

Status: PROPOSED. Nothing has been run against the database. Awaiting approval.

## Current state (SOURCE, read-only checks today)
- `recalc_worker_rating(uuid)` and `trg_recalc_worker_rating()` are plain (not security definer), EXECUTE granted to PUBLIC.
- Triggers on `worker_ratings`: after INSERT / UPDATE / DELETE → `trg_recalc_worker_rating()`.
- Policies on `worker_ratings`: public_read, public_insert_matching_booking, public_update_matching_booking, workers_view_own_ratings.
- `worker_rating_stats` view is `security_invoker=true`; only DB user found: `admin_delete_inactive_worker` (security definer, unaffected).
- Stored values match a full recompute: 23 rated workers, 0 count mismatches, 0 average mismatches.

## Patch (step 1 only — policies NOT touched)
```sql
CREATE OR REPLACE FUNCTION public.recalc_worker_rating(p_worker_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_avg numeric; v_count integer;
BEGIN
  SELECT COALESCE(AVG(rating), 0), COUNT(*) INTO v_avg, v_count
    FROM worker_ratings WHERE worker_id = p_worker_id;
  UPDATE workers SET rating = ROUND(v_avg, 2), total_ratings = v_count
   WHERE id = p_worker_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_recalc_worker_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_worker_rating(OLD.worker_id);
  ELSIF TG_OP = 'UPDATE' AND OLD.worker_id IS DISTINCT FROM NEW.worker_id THEN
    PERFORM recalc_worker_rating(OLD.worker_id);
    PERFORM recalc_worker_rating(NEW.worker_id);
  ELSE
    PERFORM recalc_worker_rating(NEW.worker_id);
  END IF;
  RETURN NULL;
END;
$function$;

-- Security definer must not be callable directly by app users
REVOKE EXECUTE ON FUNCTION public.recalc_worker_rating(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recalc_worker_rating() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_worker_rating(uuid) TO service_role;
```
Body logic is byte-for-byte the same calculation → averages/counts and anything that reads `workers.rating` / `total_ratings` (priority) get identical numbers. Triggers still fire (trigger execution does not need EXECUTE for the caller).

## Rollback (exact)
```sql
CREATE OR REPLACE FUNCTION public.recalc_worker_rating(p_worker_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$ DECLARE v_avg numeric; v_count integer;
BEGIN
  SELECT COALESCE(AVG(rating), 0), COUNT(*) INTO v_avg, v_count FROM worker_ratings WHERE worker_id = p_worker_id;
  UPDATE workers SET rating = ROUND(v_avg, 2), total_ratings = v_count WHERE id = p_worker_id;
END; $function$;
CREATE OR REPLACE FUNCTION public.trg_recalc_worker_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$ BEGIN
  IF TG_OP = 'DELETE' THEN PERFORM recalc_worker_rating(OLD.worker_id);
  ELSIF TG_OP = 'UPDATE' AND OLD.worker_id IS DISTINCT FROM NEW.worker_id THEN
    PERFORM recalc_worker_rating(OLD.worker_id); PERFORM recalc_worker_rating(NEW.worker_id);
  ELSE PERFORM recalc_worker_rating(NEW.worker_id); END IF;
  RETURN NULL; END; $function$;
GRANT EXECUTE ON FUNCTION public.recalc_worker_rating(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.trg_recalc_worker_rating() TO PUBLIC;
```

## Isolated test — NOT VERIFIED
No isolated copy of this database is reachable from here (production project only; read-only query tool). Proposed test, in a Supabase branch or staging copy:
1. Apply patch. 2. Record `rating,total_ratings` for all 23 rated workers. 3. As a test customer, insert/update/delete one rating → worker average equals full-table recompute. 4. Then (separately) drop `worker_ratings_public_read` in the branch and repeat step 3 → still equals full recompute. 5. Confirm `authenticated` cannot call `recalc_worker_rating` directly.

## Deferred (per instructions)
- `worker_ratings_public_read` removal: only after the test above passes.
- `worker_presence_snapshots`: waiting on `snapshot-worker-presence` source.
- Pause / ops cases / events_ingestion: waiting on Admin Panel auth confirmation.
- Flats: no broadening; any change only narrows.
- Start/End OTP, dispatch, payments, wallets, payouts, availability: untouched.

## Worker App publish assessment (switch OFF)
- Release contains client code only; requires no DB permission or policy change.
- Start code button/redirects appear only when a booking has `start_otp_required = true`; 0 of 965 are flagged and the switch is OFF → every booking uses the existing End-code flow unchanged (SOURCE + 224 passing tests).
- Only new data read: `start_otp_required` boolean on the worker's own bookings via existing access; no OTP values loaded.
- New exposure: none found (SOURCE). Not verified on a real phone.
- Verdict: safe to publish independently of the older 8 warnings (they exist already and are not worsened). Remaining caveat: Start code stays unusable until User App shows it — harmless while the switch is OFF.
