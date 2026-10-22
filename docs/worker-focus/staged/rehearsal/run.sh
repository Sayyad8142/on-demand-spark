#!/usr/bin/env bash
# Rehearses the migration + rollback on a throwaway local Postgres. Never touches production.
set -e
D=$(mktemp -d); H=$(dirname "$0"); S="$H/.."
initdb -D "$D/db" -U postgres >/dev/null; pg_ctl -D "$D/db" -o "-k $D -p 55432 -c listen_addresses=''" -l "$D/log" start >/dev/null
P="psql -h $D -p 55432 -U postgres -d postgres -X -q"
$P -v ON_ERROR_STOP=1 -f "$H/stub_schema.sql"
BW=$($P -tAc "select md5(string_agg(w::text, ',' order by id)) from workers w")
BB=$($P -tAc "select md5(string_agg(b::text, ',' order by id)) from bookings b")
echo "=== APPLY"; $P -v ON_ERROR_STOP=1 -1 -f "$S/001_worker_diagnostics_DRAFT.sql" && echo applied
$P -v before_w="$BW" -v before_b="$BB" -f "$H/verify.sql" 2>&1
echo "=== ROLLBACK"; $P -v ON_ERROR_STOP=1 -1 -f "$S/001_worker_diagnostics_ROLLBACK.sql" && echo rolled_back
$P -tAc "select count(*) from pg_class where relname like 'worker_diagnostic%' union all select count(*) from pg_proc where proname='upsert_worker_diagnostic_status'"
$P -tAc "select (select md5(string_agg(w::text, ',' order by id)) from workers w)='$BW' and (select md5(string_agg(b::text, ',' order by id)) from bookings b)='$BB' as data_intact_after_rollback"
echo "=== RE-APPLY"; $P -v ON_ERROR_STOP=1 -1 -f "$S/001_worker_diagnostics_DRAFT.sql" && echo reapplied
pg_ctl -D "$D/db" stop >/dev/null; rm -rf "$D"
