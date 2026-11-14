# NEW Worker App — Complete Dispatch Coordination Audit
Date: 14 Nov 2026 · Scope: NEW Worker App (Android build 10.0.03, versionCode 103) + the backend it talks to.
Mode: **READ-ONLY.** Nothing was deployed, published, changed in production data, or sent to any phone.

Evidence labels: **SOURCE** = read in this project's code · **LIVE-DB** = read-only SQL on production `paywwbuqycovjopryele` today · **REPO-FN** = Edge Function copy in this repo (production parity NOT VERIFIED — hosted source could differ) · **NOT VERIFIED** = needs a real phone or hosted source.

---
## 0. Executive summary
The new app is mostly correct on its side: it trusts the server deadline, de-duplicates, closes offers when another worker wins, and refuses expired taps. **The production problems listed originate mainly in the backend dispatch layer**, which today has several overlapping dispatchers, three different deadline rules, a push that is sent even when offer creation fails, and a "recovery" path that resurrects expired offers with a fake new 60 s window. The new app cannot fix those; the Admin Panel/back-end must.

Final: **NO-GO** for switching to a unified dispatch until the backend items in §8 are done. **GO** for the small new-app corrections in §6 (preview only, after approval).

---
## 1. NEW Worker App dispatch architecture (as built — SOURCE)
```text
         Server creates booking_requests row (one per booking+worker)
                    │                         │
          FCM data push (BOOKING_ALERT)   Realtime INSERT/UPDATE on booking_requests (worker_id=eq.me)
                    │                         │                + backup poll get-pending-worker-bookings
        Native MyFirebaseService          JS useBookingRequestsRealtime / useBookingPollingFallback
                    │                         │
             OfferQueue (persisted) ◄──── bookingAlertCoordinator (dedupe by booking ID)
                    │
  Overlay service (permission) / tray notification → BookingAlertActivity (tap)
                    │
  Accept → RPC try_accept_booking(p_booking_id)  (worker JWT)
  Reject → RPC reject_booking_offer(p_booking_id) (worker JWT)
  Telemetry → ack-booking-delivery (signed ack_token, session fallback for 3 events only)
  Closing → booking_offer_open poll every 2 s, realtime request UPDATE, BOOKING_CANCELLED / BOOKING_REASSIGNED push
```
### Answers to Task 1
| # | Question | Finding (SOURCE) |
|---|---|---|
|1|FCM receive|`MyFirebaseService.onMessageReceived` reads `getData()` only. Types (case-sensitive): `BOOKING_ALERT`, `BOOKING_CANCELLED`, `BOOKING_REASSIGNED`, `START_OTP_REMINDER_CANCEL`, `PING`, `PRACTICE_BOOKING`. JS foreground listener (`src/lib/fcm.ts`, `fcmOffer.ts`) handles the same alert/cancel/reassign types. Notification-only payloads are logged and ignored (data-only supported, not enforced).|
|2|Full-screen alerts|Overlay window (`BookingOverlayService`, `TYPE_APPLICATION_OVERLAY`) when overlay permission exists; otherwise high-priority tray notification → `BookingAlertActivity` (show-when-locked). No full-screen intent (by policy). Activity auto-opens only if app is foreground and unlocked.|
|3|Background/foreground/killed|Native receiver + persisted `OfferQueue` work without the WebView. Killed/force-stopped delivery depends on Android/FCM — **NOT VERIFIED** on device. Overlay service uses `startService` (can be refused by Android in background — NOT VERIFIED).|
|4|Retrieving active offers|FCM; realtime `booking_requests` filtered by own `worker_id` (only `pending` + future `timeout_at`, parent booking `pending`); backup poll `get-pending-worker-bookings` (10 s foreground / 30 s background); `offerFreshness.ts` drops `recovered` items and anything with ≤3 s left.|
|5|60 s countdown|Deadline = server `expires_at` → else `sent_at + ttl_seconds` → else local now + 60 s (`AlertPresentationRules.java:7-10`, `fcmOffer.ts:6-25`). Countdown runs against that fixed deadline; refresh/retry never extends it. Exception: `SimulatedOverlayModal.tsx` (test UI) runs its own 30 s timer.|
|6|Accept / Reject|Accept → `try_accept_booking` (booking ID only, JWT). Reject → `reject_booking_offer`; "rejected" shown only on `success && confirmed`. Device lock (`deviceAcceptLock` + native `claimAcceptance`, 20 s). Network/session errors keep an unexpired offer open; "gone" errors close it; `BOOKING_ACCEPTANCE_CLOSED:` closes and never retries.|
|7|Expired offer|Refused at enqueue, at notification post, on tray tap ("This booking offer has expired"), and before the Accept request is sent.|
|8|Same notification twice|Not re-shown: OfferQueue suppresses same request ID **and** any queued offer with the same booking ID; JS coordinator also dedupes by booking ID.|
|9|Another worker accepts|Request row → `lost` arrives by realtime → coordinator invalidates and native `cancel_offer`; overlay also polls `booking_offer_open` every 2 s.|
|10|Availability / 30-min slots|App only gates going ON (needs ≥1 real saved slot, 07:00–18:30). It does **not** check whether an incoming offer fits a slot — that is the server's job (REPO-FN `booking-notifications` checks `worker_availability` slots).|
|11|Cancellation|`BOOKING_CANCELLED` push releases booking-scoped alerts, posts cancellation notice, broadcasts to the WebView; realtime/2 s poll also closes.|
|12|Obsolete logic|Still present: `notify-next-tier` call after a confirmed reject (`bookingActions.ts:149`); legacy ACK body retry on HTTP 400; legacy direct insert into `booking_request_delivery_events`; `get-worker-leaderboard` (unsafe identity, see earlier audit); comment refers to `accept_booking_authoritative` while code calls `try_accept_booking`. Old bookings-INSERT listener is removed.|

---
## 2. Function / API dependency list (used by the new app for offers)
**RPCs:** `try_accept_booking(p_booking_id)` (→ `accept_booking_authoritative(id, NULL)`), `reject_booking_offer(p_booking_id)`, `booking_offer_open(p_booking_id)` (granted to anon+authenticated), `get_worker_upcoming_scheduled_bookings`. LIVE-DB: `accept_booking`, `accept_booking_authoritative`, `record_offer_ack`, `_reject_booking_request_core` are **not** executable by workers (good).
**Edge Functions called by the app:** `get-pending-worker-bookings`, `ack-booking-delivery`, `report-missed-booking`, `notify-next-tier`, `worker-heartbeat`, `update-availability`. (Others are non-dispatch.)
**Tables:** `booking_requests` (realtime + reads), `bookings` (explicit columns, realtime UPDATE `status=assigned`), `workers`, `worker_availability`, `booking_request_delivery_events` (legacy insert).
**Server-side dispatchers active in production (LIVE-DB cron):** `dispatch-pending-bookings` (1 min), `dispatch-watchdog` (1 min), `dispatch-no-ack-fallback` (every 10 s), `heal-black-hole-bookings` (1 min), `send-scheduled-booking-alerts`/`check-scheduled-bookings` (1 min), `sweep_preferred_timeouts` (1 min), `repair_scheduled_dispatch_windows` (1 min), `timeout-expired-booking-requests`, plus trigger `trg_kick_dispatch_on_request_timeout` on every request timeout. `dispatch-watchdog` and `dispatch-no-ack-fallback` source is **not in this repo** (NOT VERIFIED). Job `fcm-keepalive-job` still posts to `https://YOUR_PROJECT_REF...` with a placeholder key — broken job.

---
## 3. Current FCM payload contract (REPO-FN `send-fcm`, as read by the app)
Data-only, Android priority HIGH, FCM TTL 60 s. All values strings.
| Key | Meaning / status |
|---|---|
|`type`|`BOOKING_ALERT` / `BOOKING_CANCELLED` / `BOOKING_REASSIGNED` / `START_OTP_REMINDER_CANCEL` / `PING`|
|`booking_id`, `bookingId`|booking UUID (required)|
|`booking_request_id`|**read by the app but NOT sent by `booking-notifications` or `notify-next-tier`** (REPO-FN)|
|`ack_token`|**read by the app; not minted by these senders** (REPO-FN) → ACKs fall back to session|
|`expires_at`|epoch seconds. **Callers don't pass it, so `send-fcm` invents now + 60 s**, unrelated to the DB `timeout_at`|
|`sent_at`, `ttl_seconds`|now; default 60|
|`actionable`, `offer_kind`|`"true"`, `worker_offer`|
|`booking_type` / `offer_booking_type`|wire "instant" for actionable (legacy-app hack) / true type|
|display|`customer`, `community`, `service_type`, `flat_no`, `building_name`, `price`, `scheduled_*`, `prealert_sent`|

---
## 4. Offer acceptance & expiration contract
**What the new app expects:** offer identity = booking ID for actions (request ID only for telemetry/dedupe); server deadline in `expires_at` equal to `booking_requests.timeout_at`; offer status `pending`/`sent`/`queued`; authenticated RPC with worker JWT; responses `{success, accepted, already_assigned, error}` and `{success, confirmed, error}`.

**What the server does today (LIVE-DB):**
- `booking_requests` has a **unique (booking_id, worker_id)** constraint — one row per worker per booking ever; re-offers must UPDATE, not INSERT.
- `timeout_at` column default is **now()+45 s**; `dispatch_config.worker_ttl_seconds = 60`; REPO-FN `booking-notifications` sets **30 / 60 / 90 s by rating tier**; `dispatch-pending-bookings` comments 45 s ACK. Last 14 days: min 30 s, median 60 s, max 7 178 s windows.
- `accept_booking_authoritative`: for a `pending` row it **does not check `timeout_at`** (only the unused `accept_booking` wrapper does); for closed rows (`lost`/`timed_out`/`unreachable`/`not_delivered`) it still allows acceptance for **90 s after the deadline**. If called with `p_worker_id` while a session exists it would act as that worker — not reachable by workers today (no EXECUTE grant), but the same function is reachable through `try_accept_booking` with NULL, which is safe.
- `reject_booking_offer` refuses expired/closed offers correctly.

**Required unified contract (proposal for Admin Panel):**
1. One deadline: `timeout_at = offered_at + dispatch_config.worker_ttl_seconds` (60 s), set by one server function; push `expires_at = epoch(timeout_at)` exactly.
2. Push includes `booking_request_id` and a signed `ack_token` for that row.
3. Accept succeeds only if the caller's row is `pending/sent/queued` **and** `now() < timeout_at` (+ a small fixed grace for network, e.g. 5 s, documented). Error codes as stable strings: `offer-expired`, `already-assigned`, `not-offered`, `acceptance-closed`.
4. A re-offer to the same worker = UPDATE the same row (new `timeout_at`, `redelivery_count+1`, new `ack_token`) and send a new push carrying the same `booking_request_id`.
5. Never push unless the row write succeeded.

---
## 5. Confirmed bugs and compatibility risks
**Backend (cause of the reported problems)**
| # | Problem reported | Cause | Evidence |
|---|---|---|---|
|B1|Alerts for nonexistent offers; duplicate-offer errors; retries not progressing|`booking-notifications` bulk-INSERTs a row for every eligible worker without skipping workers already offered. Unique (booking_id, worker_id) makes the **whole insert fail**; the error is only logged and **the push is still sent**. Worker receives an alert whose row is old/closed → accept fails.|REPO-FN `booking-notifications/index.ts:384-424`; LIVE-DB unique index; `redelivery_count` is 0 on all 764 rows in 14 days (re-offer path never used)|
|B2|Conflicting 30/60/90 s deadlines|Tier timeouts 30/60/90 s in DB, but push says now+60 s; column default 45 s.|REPO-FN; LIVE-DB min 30 s/median 60 s|
|B3|Expired offers repeatedly notified / unable to accept|`get-pending-worker-bookings` returns expired `timed_out`/`not_delivered` offers up to 30 min old, **rewritten as `pending` with a fresh now+60 s**. The new app ignores them (`recovered`), but legacy apps show them; accept is then refused after the 90 s grace.|REPO-FN `get-pending-worker-bookings/index.ts:83-115`|
|B4|Dispatch retries failing|≥8 schedulers + 1 trigger can dispatch the same booking concurrently; two of them have no source in repo.|LIVE-DB cron|
|B5|Accept after deadline|Authoritative accept doesn't check `timeout_at` for `pending` rows; closed rows accepted up to 90 s late.|LIVE-DB function; 1 of 88 accepts in 14 d was after its deadline|
|B6|Silent delivery|Only 112 `push_received` vs 503 `push_sent` events (22%) in 14 d; senders send no `ack_token`, so confirmations rely on fallback.|LIVE-DB `booking_offer_events`|
|B7|Broken keepalive|`fcm-keepalive-job` uses placeholder URL/key.|LIVE-DB cron|

**New Worker App (smaller)**
|#|Issue|Impact|
|---|---|---|
|A1|Dedupe by booking ID (JS coordinator + OfferQueue) suppresses a legitimate re-offer for the same booking while the old entry is still remembered.|Real re-offer could be hidden once backend fixes B1/§4.4.|
|A2|After a confirmed reject the app calls `notify-next-tier`.|The app influences dispatch — violates "never create or reassign offers".|
|A3|Accept preflight lookup on `booking_requests` has no `worker_id` filter (`bookingActions.ts:58-63`).|Display-only (server still decides) but can pass on another worker's row; RLS limits impact.|
|A4|`SimulatedOverlayModal` has its own 30 s timer.|Only if mounted; confusing in tests.|
|A5|`claimAcceptance` is per booking, not truly device-wide.|Low; server lock still authoritative.|
|A6|Native activity auto-open only when foreground+unlocked; overlay uses `startService`.|Background presentation depends on overlay permission — NOT VERIFIED on device.|
|A7|Legacy ACK 400 retry and direct delivery-events insert remain.|Noise; harmless.|

**Legacy apps (Task 4 — not modified)** — LIVE-DB active workers: 10.0.03 = 2, 10.0.02 = 22, 10.0.01 = 11, 7.0.4 = 1, 7.0.0 = 4, 6.0.64 = 3.
- Show "recovered" expired offers (B3) and then fail to accept → visible "cannot accept".
- ≤7.0.2 needs the `booking_type="instant"` wire hack; removing it hides scheduled offers for them.
- Older builds may compute their own countdown / ignore `expires_at` (NOT VERIFIED — no source here).
- May call `reject_booking_request` with a worker id (guarded) and legacy ACK bodies (still accepted).
- Impact if the backend adopts §4: keep the payload keys, keep `booking_type` hack, keep legacy ACK shape, and stop returning fabricated recovered offers only for builds that use the new contract (or for all, accepting legacy workers will see fewer stale alerts — which is the desired fix). No forced update or blocking proposed.

---
## 6. Proposed source-level corrections (NOT APPLIED — awaiting approval)
**New Worker App (preview):**
1. Dedupe by `booking_request_id` + `timeout_at` (offer generation) instead of booking ID alone; still never two popups for one booking at once.
2. Remove the `notify-next-tier` call after reject (server already escalates).
3. Add `worker_id` filter to the accept preflight; treat it as display-only.
4. Make `SimulatedOverlayModal` use the supplied deadline, or remove it from production builds.
5. Map stable server error codes (`offer-expired`, `already-assigned`, `not-offered`) explicitly; add a "duplicate" pattern → gone.
6. Before Accept, fetch the authoritative own row (`status`, `timeout_at`) — already partly done; make the native path do the same via `booking_offer_open` + own-row check.
Tests: unit tests for each (vitest + Robolectric), keeping existing OTP/availability/payout tests green.

**Backend (Admin Panel owns — staged only, no edits under `supabase/functions/` from this project):**
1. `booking-notifications`: exclude already-offered workers or UPSERT-as-reoffer; **abort the push if the row write fails**; send `booking_request_id`, `ack_token`, `expires_at = timeout_at`.
2. One TTL (60 s) everywhere; drop rating tiers' 30/90 s or make tiers stagger *start* time, not lifetime.
3. Remove fabricated "recovered" offers from `get-pending-worker-bookings` (or return them as `recovered:true` with their real past deadline and a separate "re-offer" via the server).
4. `accept_booking_authoritative`: require `now() < timeout_at + fixed grace` for all statuses; drop the 90 s closed-row grace.
5. Consolidate dispatchers to one owner with a per-booking advisory lock; audit/retire `dispatch-watchdog`, `dispatch-no-ack-fallback`, `heal-black-hole-bookings` duplicates; fix `fcm-keepalive-job`.

---
## 7. Tests required on one real Android phone (build 10.0.03, one test worker, approved test bookings only)
1. App foreground: offer arrives → overlay; countdown equals server `timeout_at` (±2 s).
2. App background, overlay granted / not granted → overlay vs tray; tap opens activity.
3. App swiped away (killed) and after reboot → alert still arrives.
4. Screen locked → notification visible; activity over lock screen after tap.
5. Same push sent twice → one popup.
6. Re-offer to same worker after timeout → new popup (after backend fix).
7. Accept in time → assigned; accept after deadline → "expired", no assignment.
8. Two phones, two workers: one accepts → other's alert closes within ~2 s.
9. Customer cancels during offer → alert closes, cancellation notice.
10. Reject → "rejected" only after server confirms; no next-tier call from phone (after fix).
11. Airplane mode during Accept → stays open until deadline, retries, no double accept.
12. App restart mid-offer → same deadline, not extended.
13. Worker OFF / outside saved slot → no offer.
14. Regression: Start OTP, End OTP, availability save/ON, payouts screen, completed bookings unchanged.

---
## 8. Cross-app integration requirements for the Admin Panel
1. Adopt the §4 contract (single TTL, `expires_at = timeout_at`, `booking_request_id`, signed `ack_token`, push only after successful row write, re-offer = UPDATE).
2. One dispatcher with a per-booking lock; list every cron/trigger that can create or resend offers and retire duplicates.
3. Accept RPC enforces deadline; stable error codes returned to all apps.
4. Stop resurrecting expired offers in `get-pending-worker-bookings`.
5. Keep legacy compatibility fields (`booking_type` instant hack, legacy ACK body, `reject_booking_request` guard) until old versions drop below an agreed share; no forced updates without approval.
6. Provide the hosted source of `dispatch-watchdog` and `dispatch-no-ack-fallback` and confirm repo copies match production before any change.
7. Dashboard: per-offer timeline from `booking_offer_events` to measure push_sent → push_received → popup_shown.

---
## 9. GO / NO-GO
| Item | Decision |
|---|---|
| New Worker App corrections A1–A5 in preview | **GO after your approval** |
| Unified dispatch switch-over | **NO-GO** — backend B1–B5 open; hosted function parity NOT VERIFIED |
| Production deploy / APK publish / real notifications | **NO-GO** — not approved; real-phone tests (§7) not run |

Hook error `use-mobile.tsx(4,35)`: not present in current source (file uses named React imports); preview build OK.
