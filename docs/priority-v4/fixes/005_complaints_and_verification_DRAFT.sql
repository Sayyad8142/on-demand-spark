-- DRAFT ONLY. NOT EXECUTED. Isolated test project only (abort if ref = paywwbuqycovjopryele).
BEGIN;
-- A. Penalties count only when verified. Existing rows stay as they are (verified = NULL = not counted
--    by V4 until an admin reviews them). Nothing is converted automatically.
ALTER TABLE public.worker_fault_events
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS complaint_id uuid;

-- B. Complaints.
CREATE TABLE IF NOT EXISTS public.worker_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id),
  worker_id uuid NOT NULL REFERENCES public.workers(id),
  reason text NOT NULL, details text, evidence_urls text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',          -- pending | verified | rejected (validated by trigger)
  decided_by uuid, decided_at timestamptz, decision_note text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, worker_id));                  -- one complaint per booking+worker -> one penalty
GRANT SELECT, INSERT, UPDATE ON public.worker_complaints TO authenticated;
GRANT ALL ON public.worker_complaints TO service_role;
ALTER TABLE public.worker_complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage complaints" ON public.worker_complaints FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.worker_complaint_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.worker_complaints(id),
  action text NOT NULL, actor uuid, note text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.worker_complaint_events TO authenticated;
GRANT ALL ON public.worker_complaint_events TO service_role;
ALTER TABLE public.worker_complaint_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read complaint history" ON public.worker_complaint_events FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.validate_worker_complaint() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.status NOT IN ('pending','verified','rejected') THEN RAISE EXCEPTION 'invalid status'; END IF;
  IF TG_OP='UPDATE' AND OLD.status <> 'pending' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'decision is final'; END IF;
  NEW.updated_at := now(); RETURN NEW;
END $$;
CREATE TRIGGER validate_worker_complaint BEFORE INSERT OR UPDATE ON public.worker_complaints
  FOR EACH ROW EXECUTE FUNCTION public.validate_worker_complaint();

-- C. Admin decision RPC: the only path that creates a complaint penalty.
CREATE OR REPLACE FUNCTION public.admin_decide_complaint(p_id uuid, p_verified boolean, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.worker_complaints;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO c FROM worker_complaints WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not found'; END IF;
  IF c.status <> 'pending' THEN RETURN; END IF;     -- idempotent
  UPDATE worker_complaints SET status = CASE WHEN p_verified THEN 'verified' ELSE 'rejected' END,
    decided_by = auth.uid(), decided_at = now(), decision_note = p_note WHERE id = p_id;
  INSERT INTO worker_complaint_events(complaint_id, action, actor, note)
  VALUES (p_id, CASE WHEN p_verified THEN 'verified' ELSE 'rejected' END, auth.uid(), p_note);
  IF p_verified THEN
    INSERT INTO worker_fault_events(worker_id, booking_id, reason_code, source, triggered_by, note,
                                    verified_at, verified_by, complaint_id)
    VALUES (c.worker_id, c.booking_id, 'complaint_verified', 'complaint', auth.uid(), p_note, now(), auth.uid(), p_id)
    ON CONFLICT DO NOTHING;                         -- unique index from 003 B
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_decide_complaint(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_complaint(uuid, boolean, text) TO authenticated;

-- D. Verify no-show / cancellation incidents (admin only, idempotent, audited via verified_by).
CREATE OR REPLACE FUNCTION public.admin_verify_fault(p_fault_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE worker_fault_events SET verified_at = now(), verified_by = auth.uid()
   WHERE id = p_fault_id AND verified_at IS NULL
     AND reason_code IN ('worker_no_show','worker_cancelled');  -- refused/late never become penalties here
END $$;
REVOKE ALL ON FUNCTION public.admin_verify_fault(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_fault(uuid) TO authenticated;

-- E. compute_priority_score_v4 (003 C) must add: AND verified_at IS NOT NULL
--    and its reason list becomes ('worker_no_show','worker_cancelled','complaint_verified').
ROLLBACK;
