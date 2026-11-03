# Worker App — Complete Dispatch & Booking Receiving Audit (2026-11-03)

READ-ONLY. No code, database, deployment, build or notification changes were made.
Labels: **VERIFIED** (seen in project source or live read-only query), **INFERRED** (reasoned from source), **UNKNOWN** (needs phone/APK/logs/live export).
Project source ≠ installed APK ≠ live edge functions. Live DB reads are from main project `paywwbuqycovjopryele`.

Paths: native = `android/app/src/main/java/app/didisnow/worker/…`; web = `src/…`.

---

## A. Dispatch receiving flow (simple English)

1. Backend creates `booking_requests` rows for eligible workers and sends a **data-only FCM** message (VERIFIED: `supabase/functions/booking-notifications`, project copy).
2. On the phone, `MyFirebaseService.onMessageReceived` (MyFirebaseService.java:38-74) receives it, even when the WebView is not running (INFERRED: Android starts the service for delivered high-priority data pushes; not guaranteed after force-stop or OEM kill).
3. It immediately sends a `push_received` confirmation (:217-245), saves the offer in the on-phone `OfferQueue` (:281-290), posts a high-priority tray notification (:622-642), and tries to show the full-screen **overlay** (`BookingOverlayService`) — falling back to `BookingAlertActivity` if the overlay permission is missing (:303-310, 343-350).
4. In parallel the web layer listens through Realtime (`useUnifiedBookingAlerts.ts:99-160`, `useBookingRequestsRealtime.ts`) and polls `get-pending-worker-bookings` every 10s foreground / 30s background (`useBookingPollingFallback.ts:26-27`). Polling only runs while the worker is ON **and** payout-ready (`Home.tsx:107-114`).
5. Worker taps Accept → RPC `try_accept_booking(p_booking_id)` (native and web). Live: it calls `accept_booking_authoritative(p_booking_id, NULL)` — worker identity comes from the session (VERIFIED live).

## B. Notification reliability by state

| State | Mechanism | Limits |
|---|---|---|
| Open | FCM handler + Realtime + 10s polling. Native overlay can appear on top of the app. | Low risk. |
| Background | FCM handler posts notification + attempts overlay via plain `startService`. Polling slows to 30s. | INFERRED: Android 12+ background-start limits can stop the overlay/activity; tray notification still posts. |
| Locked | Overlay/activity use show-when-locked / turn-screen-on flags (BookingOverlayService.kt:395-412; BookingAlertActivity.kt:109-112). | UNKNOWN on secure keyguard / OEMs; needs phone test. |
| Closed / swiped | FCM service runs from durable prefs; ACKs queue. | **Force-stopped** apps receive nothing until opened (Android rule). OEM battery killers (Xiaomi/Oppo/Vivo) can also block. |
| Killed by Android | Same as closed. Periodic native heartbeat every ~15 min (HeartbeatWorker.kt:24-58). | Doze delays WorkManager; FCM high-priority still delivered if quota allows. |
| Internet off | Nothing arrives. ACKs queue in `worker_ack_queue` (max 100, 24h). | Offer will expire (default TTL 60s). |
| Internet back | Browser `online` → immediate poll; Realtime reconnect → resync; ACK retry worker (network-constrained, 30s exponential backoff). | Poll filters out "recovered" offers (`offerFreshness.ts:11-21`), so an offer that already timed out is not shown — by design. |
| Phone restart | `BootReceiver` (BOOT_COMPLETED, MY_PACKAGE_REPLACED) → token sync, heartbeat, ACK flush (BootReceiver.kt:20-47). | No direct-boot support: nothing until first unlock. `LocationTrackingService` referenced but **not declared in manifest** (start fails). QUICKBOOT not registered. |
| Notifications disabled | Android 13+: tray notification skipped (MyFirebaseService.java:598-605); overlay still attempted if overlay permission granted. | With both denied, the booking can arrive **silently** (push_received logged, nothing shown). |
| Battery restricted | Not mitigated beyond the exemption request. | UNKNOWN per device. |
| FCM fails | Web polling fetches pending offers directly — **only while app is open/alive**. | No native polling. |

**Alarm/sound:** booking channel `booking_alerts` is IMPORTANCE_HIGH, public on lock screen, vibration on, DND bypass requested, **no custom alarm sound or `USAGE_ALARM`** (MyFirebaseService.java:498-514). Only the *cancellation* channel uses an alarm-class sound. → Booking alert uses the default notification sound and normal notification volume, not alarm volume. (VERIFIED)
**Full-screen intent:** not used; permission explicitly removed in manifest (AndroidManifest.xml:17-19) per Play policy memory. (VERIFIED)
**Tray actions:** the tray notification has **no Accept/Reject buttons**; buttons exist only in overlay/activity. (VERIFIED)
**Duplicates:** OfferQueue rejects same request id or booking id; tray notification id = booking hash; one overlay at a time, FIFO for the rest. (VERIFIED)
**Expiry:** `expires_at` / `sent_at+ttl` / default 60s; expired offers not shown. Visual countdown clamps to ≥5s, so it can display a few seconds past the real deadline (OfferTimer.kt:23-47). (VERIFIED)

## C. Eligibility and availability (what the app sends)

Live dispatch filter (`get_dispatch_eligible_workers`, VERIFIED live): `is_active AND is_available AND NOT is_busy AND NOT is_blocked AND fcm_token IS NOT NULL AND connection_fresh AND community AND service AND exact 30-min slot`. Live setting `dispatch.connection_freshness_hours = 0` → **freshness filter is off** (ranking only).

| Parameter | Origin / writer | When | Failure behaviour |
|---|---|---|---|
| is_available | Toggle → `update-availability` → `set_worker_availability_manual` | Manual tap; re-checks slots at tap | Toast; stays as server says (re-read every 2 min) |
| is_available=false | Logout (`AuthContext.tsx:260-275`); signup **and existing-worker upsert branch** in `OtpVerify.tsx:307-358` | Logout / OTP verify | **Risk:** a returning worker going through that upsert branch is turned OFF on login (INFERRED, needs confirmation which path returning logins take) |
| is_busy | Server (accept/complete triggers, `auto_heal_stale_worker_busy` every 3 min, hourly heal) | Server only | Live: 0 busy now |
| Community / services | Signup + profile; not editable later by worker | Signup | — |
| Slots | Availability screen → `worker_availability` | Manual save | Placeholder slots don't count (availabilityGate.ts) |
| fcm_token | `pushToken.ts:146-177` (web), native `onNewToken` → prefs → heartbeat | Registration, 7-day refresh, 30-min retry, boot | Logout nulls it. Invalid tokens cleared by `send-fcm` |
| Heartbeat | Web `worker-heartbeat` every **30 min** + on resume (`useWorkerHeartbeat.ts`, comment wrongly says 2 min); native every ~15 min; each FCM receipt | Auto | Silent |
| last_active_at | Direct write on profile fetch (`useWorkerProfile.ts:93-99`) | Auto | Silent |
| Notification permission | Reported in heartbeat | Auto | — |
| ACKs | `ack-booking-delivery` | Per offer | Queued/retried |

Live snapshot (read-only, now): 39 workers, **17 ON, 13 of those ON workers have last_seen older than 30 min**, 1 ON worker has **no FCM token** (excluded from dispatch while showing ON), 0 busy.

## D. Priority score impact

The app **never writes** `priority_score` (VERIFIED: Profile `PriorityScoreCard`, `WorkerLeaderboardCard` read only). Server cron `recalc_worker_priority_scores` every 15 min (VERIFIED live). Formula (`recalc_worker_priority_score_one`, live):

- Completed bookings 7d: +5 each, max 40
- Online hours 7d: ×0.4, max 20
- Rating: (rating/5)×25; +10 if ≥4.5
- Seen in last 24h: +5
- Reachability boost (ON): heartbeat <3 min +8, <10 min +3; ACK <30 min +5, <2h smaller
- Penalties: not_reached ×5, worker_fault ×20, **no_ack_count ×2 (max −20)**
- Acceptance rate is computed (inputs from booking_requests)

**A worker can lose priority without any mistake:** `no_ack_count` grows when the phone fails to confirm delivery (Doze, network, OEM kill, a failed ACK). Also the heartbeat boost requires a heartbeat <3–10 min old, but the app heartbeats every 15–30 min, so most workers rarely earn it — workers whose phones happen to receive an FCM (which triggers a heartbeat) get it. Live: 2 workers have no_ack_count>0 (max 4).
Additionally **silent-worker suppression is ON** (`dispatch.silent_worker_no_ack_threshold=3` in 15 min → suppressed 30 min). A phone/network problem can therefore remove a worker from offers for 30 minutes. (VERIFIED settings; enforcement code location UNKNOWN — live edge function not readable.)

## E. Booking acceptance

- Call: `supabase.rpc("try_accept_booking", { p_booking_id })` (`bookingActions.ts:35-72`; native BookingOverlayService.kt:1054-1071). Worker id not sent. Session refreshed if <2 min left.
- Live: wrapper → `accept_booking_authoritative(p_booking_id, NULL)`. Atomicity / simultaneous accept / expired handling: inside that function (not exported in this audit → UNKNOWN in detail; previous audits showed row-locking).
- Double-tap: synchronous per-booking guard + `beginAcceptance` in web; in-flight flag + OfferQueue claim in native. **Native deep-link path (`App.tsx:435-464`) bypasses the web guard.**
- No automatic retry. If the internet drops after tapping Accept, the worker sees an error; the server may already have assigned — `useActiveJob` refetch (5 tries, 0.5s then 1s) and Realtime pick it up.
- An unsuccessful (returned) accept shows an error then closes the popup; a thrown error keeps it open (`useUnifiedBookingAlerts.ts:249-267`).
- Flat number appears once the booking shows in `useActiveJob` (statuses assigned/accepted/on_the_way/started).
- Accepting does not change is_available (app side, VERIFIED); is_busy set by server (INFERRED).
- **Reject:** `reject_booking_offer(p_booking_id)`; shows "rejected" only when `success && confirmed`; one token-refresh retry; may call `notify-next-tier`. Re-appearance prevented by server status; OfferQueue dedupe is per-session, not permanent history.

## F. Firebase and ACK

| Stage | Measured? |
|---|---|
| 1 FCM accepted request | `push_sent` (server trigger) — VERIFIED (289 in 7 days) |
| 2 Android received | `push_received` — native, before any dedupe (77) |
| 3 App processed | Not separately recorded (same as 2) |
| 4 Alert displayed | `popup_shown` on overlay addView / activity onResume (88) |
| 5 Worker viewed | `worker_seen` — **web only**; native overlay never sends it (55) |
| 6 Accept / reject | `accept_tapped` / `reject_tapped` + `server_accepted` / `server_rejected` |

Live 7-day counts also show `server_lost` 219, `server_not_delivered` 118, `server_unreachable` 67 — large gap between pushes sent (289) and confirmed received (77). Cause cannot be split between "phone never got it" and "phone got it but ACK didn't reach server" without phone logs. (UNKNOWN)

ACK auth: signed `ack_token` first; on 401/403 one retry with session JWT and no worker id (BackendSync.kt:238-243, 329-335). Queue: persistent, deduped by request+event, max 100, 3 token / 5 session retries, 24h pruning, logout generation guard. If no identity is available, the event is queued but **no retry job is scheduled** (BackendSync.kt:181-189) — it waits for the next heartbeat/boot flush.

## G. Worker App vs Admin Panel claims

| Admin claim | Result | Evidence |
|---|---|---|
| Batches of five | **Confirmed in live config** (`first_batch_size=5`, `retry_batch_size=5`); **contradicted by project copy** of `booking-notifications` (sends whole tier) | ops_settings vs project copy — live function source UNKNOWN |
| Connection freshness first ranking factor | Cannot verify; project copy ranks priority → rating → last offer | live function not readable |
| Rating second / exact time third / priority fourth | Cannot verify (same) | — |
| ACK/connection events influence priority | **Confirmed** | recalc_worker_priority_score_one |
| No-FCM-token workers excluded | **Confirmed** | get_dispatch_eligible_workers |
| Worker-free path may bypass ranking | Cannot verify from app | — |
| No-ACK fallback after 12s | Partly: cron `dispatch-no-ack-fallback` runs **every 10s** (live); project copy of recovery uses 45s; exact 12s not verified | cron.job |
| Favorite worker 60s exclusive | **Confirmed exists** (`sweep_preferred_timeouts` every minute, `preferred_worker_id`); 60s length not verified | live function |
| Already-offered worker gets no new independent offer | App side confirmed (OfferQueue booking-id dedupe); server side UNKNOWN | OfferQueue.kt:280-300 |

## H. Problems and risks (by severity)

| # | Issue | Evidence | Sev |
|---|---|---|---|
| 1 | `BackendSync.kt:71-97` references undeclared variables inside `pingBootSync` — native source likely **doesn't compile**; installed APK may differ from repo | native audit | CRITICAL (blocks next Android release incl. 10.0.03) |
| 2 | Worker loses priority (−2 per no-ACK, max −20) and can be suppressed 30 min for phone/network ACK failures, not worker mistakes | live formula + settings | HIGH |
| 3 | Booking channel has no alarm sound/`USAGE_ALARM`; alert plays at notification volume and can be muted by user/OEM | MyFirebaseService.java:498-514 | HIGH |
| 4 | Notifications + overlay both denied → booking received silently | :296-310, 598-605 | HIGH |
| 5 | Heartbeat every 15–30 min vs reachability boost windows of 3/10 min; 13/17 ON workers look stale | useWorkerHeartbeat.ts; live | MEDIUM |
| 6 | `MyFirebaseService.java:56-61` logs every payload key/value incl. `ack_token` | native audit | MEDIUM (security rule violation) |
| 7 | 1 ON worker without FCM token shows ON but gets nothing | live | MEDIUM |
| 8 | Existing-worker branch in `OtpVerify.tsx` writes `is_available:false` — may turn returning workers OFF on login | OtpVerify.tsx:341-358 | MEDIUM (confirm path) |
| 9 | Native overlay never sends `worker_seen` | native audit | LOW |
| 10 | Deep-link accept bypasses web double-tap guard | App.tsx:435-464 | LOW (server is authoritative) |
| 11 | Returned accept failure closes popup instead of allowing retry | useUnifiedBookingAlerts.ts:249-267 | LOW |
| 12 | `useActiveJob` visibility listener not removed (wrong reference) — listener leak | useActiveJob.ts:245-254 | LOW |
| 13 | `LocationTrackingService` started at boot but not declared | BootReceiver.kt:52-70 | LOW |
| 14 | ACK queued with no identity schedules no retry worker | BackendSync.kt:181-189 | LOW |
| 15 | `fcm-keepalive-job` cron posts to `YOUR_PROJECT_REF.supabase.co` — job is broken | live cron.job | LOW–MEDIUM |
| 16 | Countdown can show ≥5s past real expiry | OfferTimer.kt | LOW |
| 17 | 37 of 39 workers on versions older than 10.0.03; 7 on 6.x/7.x | live | MEDIUM |

## I. Recommended fixes (not implemented — wait for approval)

1. Fix `BackendSync.kt` compile issue and do a real Android build before any release.
2. Stop counting no-ACK as a priority penalty / suppression trigger unless a heartbeat in the same window proves the phone was reachable (backend, Admin Panel side).
3. Give booking alerts an alarm-class sound on a new channel id (channels can't be changed after creation).
4. Remove payload value logging in `MyFirebaseService`.
5. Show a setup warning when both notifications and overlay are denied; treat as "not reachable" in Admin Panel.
6. Align heartbeat interval with reachability windows (or widen the windows server-side).
7. Confirm and, if needed, remove the `is_available:false` write on returning-worker login.
8. Fix `fcm-keepalive-job` URL or remove the job.
9. Small app fixes: native `worker_seen`, accept retry UX, listener cleanup, deep-link guard, manifest/location cleanup.

## J. Missing evidence

- Live source of `booking-notifications`, `dispatch-no-ack-fallback`, `dispatch-watchdog`, `dispatch-pending-bookings`, `accept_booking_authoritative` internals (no management token here).
- Installed APK for versions 10.0.01/10.0.02 (to see if it matches source).
- Phone tests: background, swipe-away, force-stop, Doze, secure lock screen, notification denied, overlay denied, Android 13–16 and Xiaomi/Oppo/Vivo.
- Device logcat for the push_sent vs push_received gap.
- Effective channel sound/volume on real devices.
