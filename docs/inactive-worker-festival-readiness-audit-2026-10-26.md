# Inactive worker notification & festival readiness audit — 2026-10-26

Labels: VERIFIED (live read-only query or harmless probe), SOURCE (repo code; deployed may differ), PRIOR (earlier audits in docs/), NOT VERIFIED.
Nothing was changed, deployed, published or sent.

## 1. Architecture
- Booking → `booking-notifications` / `dispatch-pending-bookings` (cron every minute) create `booking_requests` → `send-fcm` sends data-only FCM, `android.priority=HIGH`, `ttl=60s` (SOURCE).
- Phone: `MyFirebaseService` posts the booking notification + optional overlay; ACKs go to `ack-booking-delivery` (signed ack_token, session fallback) (SOURCE/PRIOR).
- Accept/reject: `accept_booking_authoritative` / `reject_booking_offer` RPCs (PRIOR).

## 2. Can a worker inactive for 15 days get bookings?
**Yes, if** she is still Availability ON, has a valid token, and the app is not force-stopped. Repo dispatch has no heartbeat/last-seen filter (SOURCE, booking-notifications:226). Live dispatch_config (VERIFIED): 5 first batch, 5 per retry, 10 attempts, 50 max offers, 60 s TTL, 15 s cooldown — matches your design.
**Risks:** watchdog turns ON workers OFF after 5 min stale heartbeat (SOURCE `HEARTBEAT_STALE_MIN=5`, PRIOR flapping evidence); repo dispatch still excludes `overlay_permission_granted=false` (SOURCE:244); deployed dispatcher code ≠ repo (PRIOR, NOT VERIFIED).

## 3. Live numbers — Prestige High Fields, 35 workers (VERIFIED)
| Group | Workers | Offers sent 30d | Accepted 30d |
|---|---|---|---|
| A Active and reachable | 13 | 1296 | 142 |
| B Infrequent but reachable | 2 | 37 | 5 |
| C Available, delivery unconfirmed | 3 | 93 | 0 |
| D No/invalid push token (ON) | 4 | 35 | 0 |
| E Availability OFF | 11 | 591 | 70 |
| F Inactive/blocked | 2 | 63 | 3 |
- Only 22 ON; 9 not opened in 7+ days, 5 in 15+ days. Only 12 rated ≥4.5 (tier 1).
- Last 14 days: 1710 push_sent vs 167 push_received (last 2026-10-24), 183 popup_shown, 123 worker_seen. Receipts are partial → "unknown", not "failed".
- Offers concentrated: group A gets ~60% of all sends.

## 4. Root causes (ordered)
1. Watchdog 5-min auto-OFF removes inactive-but-reachable workers (SOURCE+PRIOR).
2. Overlay-permission filter in dispatch excludes workers with notification-only setup (SOURCE).
3. 4 ON workers have no token — unreachable until they open the app (VERIFIED).
4. Tier grouping (4.5★) means tier-2 workers only get offers if tier 1 empty (SOURCE/PRIOR).
5. FCM `ttl=60s`: a phone in Doze/offline >60 s never gets the offer (SOURCE) — correct for instant offers, but means sleeping phones miss them.
6. Force-stop blocks FCM until app opened (Android behavior, NOT fixable server-side).
7. Deployed dispatcher source unavailable — NOT VERIFIED.

## 5. 50-worker scenario (reasoned from config, NOT simulated)
Max 50 offers/booking over 10 rounds of 5 ≈ 10 × (60 s + 15 s) ≈ 12.5 min. With 10 busy, the next ranked workers get offers; inactive workers are reached only if still ON + tokened + not excluded above. Simulation on an isolated database was NOT RUN (no test DB provided).

## 6–9. Proposed fixes (await approval)
- **Backend:** raise watchdog to 45–60 min and only pause for missing/invalid token; remove overlay filter; export deployed dispatcher; read-only eligibility diagnostics RPC; festival-readiness table (`worker_readiness_confirmations`) + capped reminder sender (max 1/day, opt-out).
- **Worker App:** "Confirm I'm available for <date>" card (never toggles availability); existing token resync on start/boot stays.
- **Admin Panel:** dashboard with the groups above + inactive 3/7/15 days, "confirmed reachable" only from receipts within 7 days, others "unknown".
- **Cost:** none beyond FCM (free) and small table.

## 11–12. Test & rollback
Isolated DB with synthetic 50 workers / 25–50 bookings; FCM `validate_only`. Each backend change is a single function/column rollback; app card behind a remote switch.

## 13. Recommendation
NO-GO for festival readiness as-is. GO to implement fixes 1–3 first after your approval.
