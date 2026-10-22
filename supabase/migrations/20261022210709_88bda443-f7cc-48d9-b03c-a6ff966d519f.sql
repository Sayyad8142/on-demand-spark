revoke all on public.worker_diagnostic_events, public.worker_diagnostic_status from anon;
revoke insert, update, delete, truncate, references, trigger on public.worker_diagnostic_events, public.worker_diagnostic_status from authenticated;
revoke all on sequence public.worker_diagnostic_events_id_seq from anon, authenticated;