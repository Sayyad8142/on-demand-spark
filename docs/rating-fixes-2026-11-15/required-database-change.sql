-- STAGED ONLY. NOT APPLIED. Run as a migration only after separate deployment approval.
-- Before applying: verify User App identity mapping and every ranking consumer listed in HANDOFF.md.
BEGIN;

ALTER TABLE public.worker_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS worker_ratings_public_read ON public.worker_ratings;
DROP POLICY IF EXISTS workers_view_own_ratings ON public.worker_ratings;
DROP POLICY IF EXISTS worker_ratings_public_insert_matching_booking ON public.worker_ratings;
DROP POLICY IF EXISTS worker_ratings_public_update_matching_booking ON public.worker_ratings;

REVOKE ALL ON public.worker_ratings FROM anon;
REVOKE DELETE ON public.worker_ratings FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.worker_ratings TO authenticated;
GRANT ALL ON public.worker_ratings TO service_role;

CREATE POLICY rating_customer_read ON public.worker_ratings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = worker_ratings.user_id
  AND (p.id = auth.uid() OR p.firebase_uid = auth.uid()::text)));
CREATE POLICY rating_worker_completed_read ON public.worker_ratings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.workers w JOIN public.bookings b ON b.worker_id = w.id
  WHERE w.id = worker_ratings.worker_id AND b.id = worker_ratings.booking_id
    AND b.status = 'completed' AND (w.user_id = auth.uid()::text OR w.id = auth.uid())));
CREATE POLICY rating_admin_read ON public.worker_ratings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY rating_customer_insert ON public.worker_ratings FOR INSERT TO authenticated
WITH CHECK (
  NOT public.has_role(auth.uid(), 'worker'::public.app_role)
  AND NOT EXISTS (SELECT 1 FROM public.workers w WHERE w.user_id = auth.uid()::text OR w.id = auth.uid())
  AND rating BETWEEN 1 AND 5
  AND EXISTS (SELECT 1 FROM public.bookings b JOIN public.profiles p ON p.id = b.user_id
    WHERE b.id = worker_ratings.booking_id AND b.user_id = worker_ratings.user_id
      AND b.worker_id = worker_ratings.worker_id
      AND (p.id = auth.uid() OR p.firebase_uid = auth.uid()::text)));
CREATE POLICY rating_customer_update ON public.worker_ratings FOR UPDATE TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'worker'::public.app_role)
  AND NOT EXISTS (SELECT 1 FROM public.workers w WHERE w.user_id = auth.uid()::text OR w.id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = worker_ratings.user_id
    AND (p.id = auth.uid() OR p.firebase_uid = auth.uid()::text)))
WITH CHECK (
  NOT public.has_role(auth.uid(), 'worker'::public.app_role)
  AND NOT EXISTS (SELECT 1 FROM public.workers w WHERE w.user_id = auth.uid()::text OR w.id = auth.uid())
  AND rating BETWEEN 1 AND 5
  AND EXISTS (SELECT 1 FROM public.bookings b JOIN public.profiles p ON p.id = b.user_id
    WHERE b.id = worker_ratings.booking_id AND b.user_id = worker_ratings.user_id
      AND b.worker_id = worker_ratings.worker_id
      AND (p.id = auth.uid() OR p.firebase_uid = auth.uid()::text)));

-- RLS must not make the existing aggregate recomputation partial or block customer writes.
-- This changes execution privileges only, not the existing calculation or ranking formula.
ALTER FUNCTION public.recalc_worker_rating(uuid) SECURITY DEFINER;
ALTER FUNCTION public.recalc_worker_rating(uuid) SET search_path = public;
REVOKE ALL ON FUNCTION public.recalc_worker_rating(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_worker_rating(uuid) TO service_role;
ALTER FUNCTION public.trg_recalc_worker_rating() SECURITY DEFINER;
ALTER FUNCTION public.trg_recalc_worker_rating() SET search_path = public;
REVOKE ALL ON FUNCTION public.trg_recalc_worker_rating() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_recalc_worker_rating() TO service_role;

-- Preserve booking and customer linkage during customer edits.
CREATE OR REPLACE FUNCTION public.guard_rating_linkage() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.booking_id IS DISTINCT FROM OLD.booking_id OR NEW.worker_id IS DISTINCT FROM OLD.worker_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Rating linkage is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_rating_linkage() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER rating_linkage_guard BEFORE UPDATE ON public.worker_ratings
FOR EACH ROW EXECUTE FUNCTION public.guard_rating_linkage();

-- Protect the second feedback table, even though the current Worker App reads worker_ratings.
DROP POLICY IF EXISTS worker_reviews_worker_select ON public.worker_reviews;
CREATE POLICY worker_reviews_worker_completed_select ON public.worker_reviews FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.workers w JOIN public.bookings b ON b.worker_id = w.id
  WHERE w.id = worker_reviews.worker_id AND b.id = worker_reviews.booking_id
    AND b.status = 'completed' AND (w.user_id = auth.uid()::text OR w.id = auth.uid())));

-- No bookings, OTP, dispatch, availability, payout, ranking, or historical rating values are changed.
COMMIT;