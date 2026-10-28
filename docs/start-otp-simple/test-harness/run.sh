set -u
D=/tmp/startotp-test
rm -rf $D/pg; mkdir -p $D/pg
id -u postgres >/dev/null 2>&1 || true
initdb -D $D/pg/data -U postgres -A trust >/dev/null
pg_ctl -D $D/pg/data -o "-p 55432 -k $D/pg -c listen_addresses=''" -l $D/pg/log start -w >/dev/null
P="psql -h $D/pg -p 55432 -U postgres -X -q -v ON_ERROR_STOP=1"
$P -c "create database t"
$P -d t -f $D/00_base.sql && echo BASE_OK
$P -d t -f $D/01_migration.sql && echo MIGRATION_OK
$P -d t -v ON_ERROR_STOP=0 -f $D/02_tests.sql 2>&1 | tee $D/tests.out | grep -v "^$" | tail -80
$P -d t -f $D/03_rollback.sql && echo ROLLBACK_OK
$P -d t -At -c "select count(*) from information_schema.columns where table_name='bookings' and column_name='start_otp_required'" | sed 's/^/flag_column_after_rollback=/'
$P -d t -f $D/01_migration.sql && echo REAPPLY_AFTER_ROLLBACK_OK
pg_ctl -D $D/pg/data stop -m fast >/dev/null
