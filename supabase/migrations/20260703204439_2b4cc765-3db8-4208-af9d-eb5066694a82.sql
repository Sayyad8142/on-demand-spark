
-- Helper: resolve current worker id from auth.uid()
CREATE OR REPLACE FUNCTION public.current_worker_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.workers
  WHERE user_id = (auth.uid())::text OR id = auth.uid()
  LIMIT 1
$$;

-- Grants for academy tables
GRANT SELECT ON public.academy_categories TO anon, authenticated;
GRANT SELECT ON public.academy_lessons TO anon, authenticated;
GRANT SELECT ON public.academy_lesson_targets TO anon, authenticated;
GRANT SELECT ON public.academy_quiz_questions TO anon, authenticated;
GRANT SELECT ON public.academy_certificates TO anon, authenticated;
GRANT SELECT ON public.academy_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.academy_worker_progress TO authenticated;
GRANT SELECT ON public.academy_worker_certificates TO authenticated;
GRANT ALL ON public.academy_categories, public.academy_lessons, public.academy_lesson_targets, public.academy_quiz_questions, public.academy_certificates, public.academy_settings, public.academy_worker_progress, public.academy_worker_certificates TO service_role;

-- Public read policies (active only)
CREATE POLICY "Workers view active categories" ON public.academy_categories
  FOR SELECT USING (is_active = true);

CREATE POLICY "Workers view active lessons" ON public.academy_lessons
  FOR SELECT USING (status = 'active');

CREATE POLICY "Workers view lesson targets" ON public.academy_lesson_targets
  FOR SELECT USING (true);

CREATE POLICY "Workers view quiz questions" ON public.academy_quiz_questions
  FOR SELECT USING (true);

CREATE POLICY "Workers view active certificates" ON public.academy_certificates
  FOR SELECT USING (is_active = true);

CREATE POLICY "Anyone view academy settings" ON public.academy_settings
  FOR SELECT USING (true);

-- Worker progress: own only
CREATE POLICY "Workers view own progress" ON public.academy_worker_progress
  FOR SELECT USING (worker_id = public.current_worker_id());

CREATE POLICY "Workers insert own progress" ON public.academy_worker_progress
  FOR INSERT WITH CHECK (worker_id = public.current_worker_id());

CREATE POLICY "Workers update own progress" ON public.academy_worker_progress
  FOR UPDATE USING (worker_id = public.current_worker_id())
  WITH CHECK (worker_id = public.current_worker_id());

-- Worker certificates: own only
CREATE POLICY "Workers view own certificates" ON public.academy_worker_certificates
  FOR SELECT USING (worker_id = public.current_worker_id());
