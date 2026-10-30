# Review of the 8 critical security warnings (2026-10-30, read-only)

Nothing changed. Every table below also has full table rights for signed-out (anon) and signed-in users, so the policy is the only lock.

| # | Table | What's open | Data exposed | Worker App uses it directly? | Proposed minimum fix | Worker App risk |
|---|---|---|---|---|---|---|
| 1 | worker_ratings (134 rows) | Anyone, even signed out, can read every row | Customer user_id, comments, booking link (customer + worker data) | Yes: Profile, Bookings, Customer Reviews read **own** ratings only | Drop `worker_ratings_public_read`; add admin read (`is_admin()`) | None: all 134 ratings belong to workers whose id = login id, already covered by `workers_view_own_ratings` |
| 2 | flats (~6,765) | Anyone can read (2 duplicate policies) | Community/building flat numbers, tower, floor (company + customer address data) | No direct reads | Replace both with signed-in-only read | None found; server functions bypass policies |
| 3 | events_ingestion | Anyone can read | Internal import counts/notes (company) | No | Drop public read (admin-only) | None |
| 4 | academy_quiz_questions | Anyone can read | Training content + correct answers (company) | No direct reads | Signed-in read only | None |
| 5 | academy_lesson_targets | Anyone can read | Lesson targeting (company) | No direct reads | Signed-in read only | None |
| 6 | worker_presence_snapshots (~68k) | Anyone, even signed out, can **insert** | Fake presence records poison ops metrics | No | Drop `wps_service_role_insert` (server role bypasses policies anyway) | None |
| 7 | worker_emergency_pause | Any signed-in user can read/insert/**update** | Worker pause log incl. `prev_is_available` used when releasing pauses: tampering can change availability on release | No | Admin-only (`is_admin()`) for all three | None for Worker App; Admin Panel must be signed in as admin (NOT VERIFIED how it reads) |
| 8 | worker_ops_case_events | Any signed-in user can read/insert | Ops case messages, actor names (worker + company) | No | Admin-only read/insert | Same as 7 |

Highest priority: 1 (customer data readable signed-out), 7 (can affect worker availability), 6, 8.

Live `complete-booking-with-otp` source: NOT RETRIEVABLE (no Supabase management access token in this environment). Project copy accepts `assigned, accepted, on_the_way, started`. Live behaviour NOT VERIFIED.
