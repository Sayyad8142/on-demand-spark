-- DRAFT ONLY. NOT EXECUTED. Run only after independent isolated-target approval.
BEGIN;
DO $guard$
BEGIN
  IF current_setting('priority_v4.environment', true) IS DISTINCT FROM 'isolated-synthetic'
     OR current_setting('priority_v4.approval_ref', true) IS NULL
     OR length(coalesce(current_setting('priority_v4.approval_ref', true), '')) < 12
     OR current_setting('priority_v4.expected_database', true) IS DISTINCT FROM current_database()
     OR current_database() <> 'isolated_v4_fixture'
  THEN RAISE EXCEPTION 'V4 draft refused: approved isolated fixture database required'; END IF;
END $guard$;

CREATE TABLE public.v4_offer_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), worker_id uuid NOT NULL, booking_id uuid NOT NULL, request_id uuid NOT NULL UNIQUE, generation integer NOT NULL CHECK(generation>=0), round integer NOT NULL CHECK(round>=0), valid_from timestamptz NOT NULL, terminal_at timestamptz CHECK(terminal_at>=valid_from), raw_status text NOT NULL, normalized_status text NOT NULL CHECK(normalized_status IN ('accepted','rejected','lost','timed_out','technical','unresolved')), writer_version text NOT NULL, confirmed_response boolean NOT NULL DEFAULT false, ack_provenance text NOT NULL CHECK(ack_provenance IN ('independent_verified','derived_from_server_response','legacy_untrusted','none')), eligibility_provenance jsonb NOT NULL, settled boolean NOT NULL DEFAULT false, exclusion_reason text, evaluated_revision integer NOT NULL CHECK(evaluated_revision>0), batch_id uuid NOT NULL REFERENCES public.v4_evidence_batches(id), UNIQUE(worker_id,booking_id,generation,round)
);
GRANT SELECT, INSERT ON public.v4_offer_opportunities TO service_role;
REVOKE ALL ON public.v4_offer_opportunities FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_offer_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_offer_opportunities_server ON public.v4_offer_opportunities FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_offer_visibility_intervals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid NOT NULL REFERENCES public.v4_offer_opportunities(id), client_event_id text NOT NULL, occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL CHECK(received_at>=occurred_at), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>=starts_at), monotonic_elapsed_ms bigint NOT NULL CHECK(monotonic_elapsed_ms>=0), client_version text NOT NULL, validation_revision integer NOT NULL CHECK(validation_revision>0), trusted boolean NOT NULL DEFAULT false, provenance text NOT NULL, UNIQUE(opportunity_id,client_event_id)
);
GRANT SELECT, INSERT ON public.v4_offer_visibility_intervals TO service_role;
REVOKE ALL ON public.v4_offer_visibility_intervals FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_offer_visibility_intervals ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_offer_visibility_intervals_server ON public.v4_offer_visibility_intervals FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.v4_availability_intervals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), worker_id uuid NOT NULL, service text NOT NULL CHECK(service IN ('Maid','Bathroom Cleaning')), cohort_key text NOT NULL, canonical_key text NOT NULL UNIQUE, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>=starts_at), explicit_on boolean NOT NULL, duration_minutes numeric GENERATED ALWAYS AS (extract(epoch FROM (ends_at-starts_at))/60) STORED, observed_minutes numeric NOT NULL CHECK(observed_minutes>=0), fulfilled_minutes numeric NOT NULL CHECK(fulfilled_minutes>=0 AND fulfilled_minutes<=observed_minutes), excluded_minutes numeric NOT NULL CHECK(excluded_minutes>=0), trusted boolean NOT NULL DEFAULT false, exclusion_reason text, source_watermark timestamptz NOT NULL, batch_id uuid NOT NULL REFERENCES public.v4_evidence_batches(id), CHECK(observed_minutes+excluded_minutes<=duration_minutes), CHECK(explicit_on OR observed_minutes=0)
);
GRANT SELECT, INSERT ON public.v4_availability_intervals TO service_role;
REVOKE ALL ON public.v4_availability_intervals FROM PUBLIC, anon, authenticated;
ALTER TABLE public.v4_availability_intervals ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_availability_intervals_server ON public.v4_availability_intervals FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
