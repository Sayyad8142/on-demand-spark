-- STAGED ONLY. Review and deploy separately through the database migration tool.
-- Hosted backups captured 2026-11-18; recheck definitions before deployment.
-- No worker backfill, exemption changes, ranking/timing/payment/OTP edits.
BEGIN;
CREATE OR REPLACE FUNCTION public.worker_approval_allows_online(p_status text, p_requires boolean)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(p_status,'pending_approval') = 'approved'
      OR (coalesce(p_requires, true) = false AND coalesce(p_status,'pending_approval') NOT IN ('rejected','suspended'))
$function$;

CREATE OR REPLACE FUNCTION public.guard_worker_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('authenticated','anon') AND NOT public.is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.approval_status := 'pending_approval';
      NEW.approval_reviewed_at := NULL;
      NEW.approval_reviewed_by := NULL;
      NEW.approval_rejection_reason := NULL;
      NEW.availability_requires_approval := true;
    ELSE
      NEW.approval_status := OLD.approval_status;
      NEW.approval_reviewed_at := OLD.approval_reviewed_at;
      NEW.approval_reviewed_by := OLD.approval_reviewed_by;
      NEW.approval_rejection_reason := OLD.approval_rejection_reason;
      NEW.availability_requires_approval := OLD.availability_requires_approval;
    END IF;
  END IF;

  IF NEW.is_available IS TRUE
     AND NOT public.worker_approval_allows_online(NEW.approval_status, NEW.availability_requires_approval) THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_available := false;
    ELSIF OLD.is_available IS NOT TRUE THEN
      RAISE EXCEPTION 'WORKER_NOT_APPROVED: this worker must be approved by an admin before switching availability ON'
        USING ERRCODE = 'P0001';
    ELSE
      -- Revocation must clear ON; legacy pending review remains allowed by the shared helper.
      NEW.is_available := false;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.get_dispatch_eligible_workers(p_service text, p_community text, p_day smallint DEFAULT NULL::smallint, p_slot text DEFAULT NULL::text)
 RETURNS TABLE(worker_id uuid, full_name text, phone text, last_heartbeat_at timestamp with time zone, last_seen_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ist timestamp := (now() AT TIME ZONE 'Asia/Kolkata');
  v_day smallint := COALESCE(p_day, EXTRACT(DOW FROM v_ist)::smallint);
  v_slot text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres','supabase_admin')
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_slot IS NULL THEN
    v_slot := to_char(date_trunc('hour', v_ist) + (CASE WHEN EXTRACT(MINUTE FROM v_ist) >= 30 THEN interval '30 min' ELSE interval '0' END), 'HH24:MI:00');
  ELSE
    v_slot := lpad(split_part(p_slot, ':', 1), 2, '0') || ':' ||
      CASE WHEN COALESCE(NULLIF(split_part(p_slot, ':', 2), ''), '0')::int >= 30 THEN '30' ELSE '00' END || ':00';
  END IF;
  RETURN QUERY
  SELECT w.id, w.full_name, w.phone, w.last_heartbeat_at, w.last_seen_at
  FROM workers w
  WHERE w.is_active AND w.is_available AND w.is_busy = false AND w.is_blocked = false
    AND public.worker_approval_allows_online(w.approval_status, w.availability_requires_approval)
    AND w.fcm_token IS NOT NULL
    AND public.worker_connection_fresh(w.last_heartbeat_at, w.last_seen_at)
    AND w.communities @> ARRAY[p_community] AND w.service_types @> ARRAY[p_service]
    AND EXISTS (SELECT 1 FROM worker_availability wa WHERE wa.worker_id = w.id AND wa.day_of_week = v_day AND v_slot = ANY(wa.slots))
  ORDER BY w.full_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dispatch_eligible_worker_count(p_service text, p_community text, p_day smallint DEFAULT NULL::smallint, p_slot text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH v AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata') AS ist),
  p AS (
    SELECT COALESCE(p_day, EXTRACT(DOW FROM ist)::smallint) AS d,
      CASE WHEN p_slot IS NULL THEN
        to_char(date_trunc('hour', ist) + (CASE WHEN EXTRACT(MINUTE FROM ist) >= 30 THEN interval '30 min' ELSE interval '0' END), 'HH24:MI:00')
      ELSE lpad(split_part(p_slot, ':', 1), 2, '0') || ':' ||
        CASE WHEN COALESCE(NULLIF(split_part(p_slot, ':', 2), ''), '0')::int >= 30 THEN '30' ELSE '00' END || ':00'
      END AS s
    FROM v)
  SELECT count(*)::int FROM workers w, p
  WHERE w.is_active AND w.is_available AND w.is_busy = false AND w.is_blocked = false
    AND public.worker_approval_allows_online(w.approval_status, w.availability_requires_approval)
    AND w.fcm_token IS NOT NULL
    AND public.worker_connection_fresh(w.last_heartbeat_at, w.last_seen_at)
    AND w.communities @> ARRAY[p_community] AND w.service_types @> ARRAY[p_service]
    AND EXISTS (SELECT 1 FROM worker_availability wa WHERE wa.worker_id = w.id AND wa.day_of_week = p.d AND p.s = ANY(wa.slots));
$function$;

CREATE OR REPLACE FUNCTION public.get_eligible_workers(p_service text, p_community text, p_limit integer DEFAULT 50)
 RETURNS TABLE(worker_id uuid, full_name text, photo_url text, rating_avg numeric, rating_count integer, completed_bookings_count integer, last_seen_at timestamp with time zone, is_fresh boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dow  int;
  v_slot text;
  v_fresh_threshold interval := '10 minutes';
  v_stale_threshold interval := '30 minutes';
BEGIN
  -- Timezone-aware slotting
  v_dow := (extract(dow FROM now() AT TIME ZONE 'Asia/Kolkata')::int + 6) % 7;
  v_slot := to_char(
    date_trunc('hour', now() AT TIME ZONE 'Asia/Kolkata')
    + interval '30 min'
      * floor(extract(minute FROM now() AT TIME ZONE 'Asia/Kolkata') / 30),
    'HH24:MI:SS'
  );

  RETURN QUERY
  SELECT
    w.id                                            AS worker_id,
    w.full_name,
    w.photo_url,
    COALESCE(w.rating, 5.0)                         AS rating_avg,
    COALESCE(w.total_ratings, 0)::int               AS rating_count,
    COALESCE(w.total_bookings_completed, 0)::int    AS completed_bookings_count,
    w.last_seen_at,
    (w.last_seen_at > now() - v_fresh_threshold)    AS is_fresh
  FROM workers w
  JOIN worker_availability wa ON wa.worker_id = w.id
  WHERE w.is_active = true
    AND w.is_available = true
    AND (w.is_busy = false OR w.is_busy IS NULL)
    AND COALESCE(w.is_blocked, false) = false
    AND public.worker_approval_allows_online(w.approval_status, w.availability_requires_approval)
    AND w.fcm_token IS NOT NULL
    AND p_service = ANY(w.service_types)
    AND p_community = ANY(w.communities)
    AND wa.day_of_week = v_dow
    AND v_slot = ANY(wa.slots)
    -- Heartbeat gate (fresh or stale)
    AND w.last_seen_at > now() - v_stale_threshold
  ORDER BY
    (w.last_seen_at > now() - v_fresh_threshold) DESC, -- Fresh first
    COALESCE(w.rating, 5.0) DESC,
    w.last_seen_at DESC NULLS LAST
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_booking_authoritative(p_booking_id uuid, p_worker_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_worker   public.workers;
  v_booking  public.bookings;
  v_auth     uuid := auth.uid();
  v_claimed  uuid;
  v_overlap  int;
  v_req      public.booking_requests;
  v_pref_req public.booking_requests;
BEGIN
  IF p_worker_id IS NOT NULL THEN
    SELECT * INTO v_worker FROM public.workers WHERE id = p_worker_id LIMIT 1;
  ELSIF v_auth IS NOT NULL THEN
    SELECT * INTO v_worker FROM public.workers
     WHERE user_id::text = v_auth::text OR id = v_auth
     LIMIT 1;
  ELSE
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Not authenticated', 'message', 'Not authenticated');
  END IF;

  IF v_worker.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Worker not found', 'message', 'Worker not found');
  END IF;

  IF NOT public.worker_approval_allows_online(v_worker.approval_status, v_worker.availability_requires_approval) THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'WORKER_NOT_APPROVED', 'message', 'This worker must be approved before accepting bookings');
  END IF;

  IF NOT COALESCE(v_worker.is_active, false) THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Your account is not active', 'message', 'Your account is not active');
  END IF;
  IF COALESCE(v_worker.is_blocked, false) THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Your account is blocked', 'message', 'Your account is blocked');
  END IF;
  IF COALESCE(v_worker.payout_ready, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Please add valid bank details before accepting bookings', 'message', 'Please add valid bank details before accepting bookings');
  END IF;
  IF NOT COALESCE(v_worker.is_available, false) THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'You are not available', 'message', 'You are not available');
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Booking not found', 'message', 'Booking not found');
  END IF;
  IF v_booking.worker_id IS NOT NULL OR v_booking.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'already_assigned', true,
                              'error', 'Already assigned to someone else', 'message', 'Already assigned to someone else');
  END IF;

  -- ── PREFERRED-WORKER RESERVATION GUARD (defense in depth) ──
  -- While the booking is reserved for the customer's chosen worker and her
  -- exclusive offer has not yet expired, nobody else may accept — regardless
  -- of stale pushes or hand-crafted requests.
  IF v_booking.preferred_worker_id IS NOT NULL
     AND v_booking.preferred_worker_id <> v_worker.id THEN
    SELECT * INTO v_pref_req FROM public.booking_requests
     WHERE booking_id = p_booking_id
       AND worker_id = v_booking.preferred_worker_id
     LIMIT 1;

    IF v_pref_req.id IS NULL OR v_pref_req.timeout_at IS NULL OR v_pref_req.timeout_at > now() THEN
      RETURN jsonb_build_object('success', false, 'accepted', false,
        'error', 'Reserved for the customer''s preferred worker',
        'message', 'Reserved for the customer''s preferred worker');
    END IF;
  END IF;

  -- ── OFFER TARGETING: a worker session may only accept a booking she was
  -- actually offered. Service-role / admin calls (explicit p_worker_id with
  -- no session) bypass this deliberately for manual assignment.
  IF v_auth IS NOT NULL THEN
    SELECT * INTO v_req FROM public.booking_requests
     WHERE booking_id = p_booking_id AND worker_id = v_worker.id
     LIMIT 1;

    IF v_req.id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'accepted', false,
        'error', 'This booking was not offered to you',
        'message', 'This booking was not offered to you');
    END IF;

    IF v_req.status NOT IN ('pending','sent','queued','accepted')
       AND COALESCE(v_req.responded_at, v_req.timeout_at, now()) < now() - interval '90 seconds' THEN
      RETURN jsonb_build_object('success', false, 'accepted', false,
        'error', 'This offer has expired',
        'message', 'This offer has expired');
    END IF;
  END IF;

  IF NOT (v_booking.service_type = ANY(COALESCE(v_worker.service_types, ARRAY[]::text[]))) THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Service type mismatch', 'message', 'Service type mismatch');
  END IF;
  IF NOT (v_booking.community = ANY(COALESCE(v_worker.communities, ARRAY[]::text[]))
          OR v_booking.community = v_worker.community) THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Community mismatch', 'message', 'Community mismatch');
  END IF;

  SELECT count(*) INTO v_overlap
  FROM public.bookings b
  WHERE b.worker_id = v_worker.id
    AND b.id <> p_booking_id
    AND b.status IN ('assigned','accepted','on_the_way','started','confirmed','in_progress');
  IF v_overlap > 0 THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'error', 'Worker is already busy with another booking', 'message', 'Worker is already busy with another booking');
  END IF;

  UPDATE public.bookings
  SET worker_id        = v_worker.id,
      worker_name      = v_worker.full_name,
      worker_phone     = v_worker.phone,
      worker_upi       = v_worker.upi_id,
      worker_photo_url = v_worker.photo_url,
      status           = 'assigned',
      dispatch_status  = 'assigned',
      assigned_at      = now(),
      accepted_at      = now(),
      confirmed_at     = now(),
      manual_assignment_required = false,
      updated_at       = now()
  WHERE id = p_booking_id
    AND worker_id IS NULL
    AND status = 'pending'
  RETURNING id INTO v_claimed;

  IF v_claimed IS NULL THEN
    RETURN jsonb_build_object('success', false, 'accepted', false, 'already_assigned', true,
                              'error', 'Already assigned to someone else', 'message', 'Already assigned to someone else');
  END IF;

  UPDATE public.workers SET is_busy = true, updated_at = now() WHERE id = v_worker.id;

  UPDATE public.booking_requests
     SET status = 'accepted', responded_at = now()
   WHERE booking_id = p_booking_id AND worker_id = v_worker.id;

  UPDATE public.booking_requests
     SET status = 'lost', responded_at = now()
   WHERE booking_id = p_booking_id
     AND worker_id <> v_worker.id
     AND status IN ('pending','sent','queued');

  UPDATE public.ops_alerts
     SET status = 'resolved', resolved_at = now(), updated_at = now()
   WHERE entity_type = 'booking'
     AND entity_id = p_booking_id
     AND alert_type IN ('manual_assignment_required',
                        'manual_assignment_required_after_redelivery',
                        'SCHEDULED_DISPATCH_NO_OFFERS',
                        'SCHEDULED_OVERDUE_NO_WORKER')
     AND status = 'open';

  BEGIN
    INSERT INTO public.booking_events (booking_id, type, meta)
    VALUES (p_booking_id, 'accepted', jsonb_build_object(
      'worker_id', v_worker.id,
      'worker_name', v_worker.full_name,
      'accepted_at', now(),
      'was_preferred_worker', (v_booking.preferred_worker_id = v_worker.id),
      'path', 'accept_booking_authoritative'
    ));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    INSERT INTO public.booking_status_history (booking_id, from_status, to_status, note)
    VALUES (p_booking_id, 'pending', 'assigned',
            'Authoritative accept by worker ' || COALESCE(v_worker.full_name, v_worker.id::text));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'accepted', true, 'booking_id', p_booking_id,
                            'worker_id', v_worker.id, 'message', 'Booking accepted successfully');
END;
$function$;

COMMIT;
