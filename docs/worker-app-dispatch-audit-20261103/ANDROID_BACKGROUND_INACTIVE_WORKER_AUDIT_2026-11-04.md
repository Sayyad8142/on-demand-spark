# Didi Now Worker App — Android Background Notification & Inactive Worker Audit

Date: 2026-11-04 (IST). READ-ONLY. No code, build, release, deploy, test push or database write.
Labels: **SOURCE** = read in repo code · **LIVE** = read-only query on production DB · **PRIOR** = earlier audit · **NOT VERIFIED** = needs a real phone.

Android source state: versionCode 103 / 10.0.03, targetSdk 36, minSdk 24, Firebase BoM 33.6.0, WorkManager 2.9.0.
Phones in the field: almost all on 10.0.02 or older; 10.0.03 is not built yet.

---

## 0. Headline findings

1. **Booking alerts work without the app being open (SOURCE).** FCM data-only push → native `MyFirebaseService` → saves the offer, posts a notification, shows the overlay or native alert screen, and Accept/Reject call the server natively (`try_accept_booking`, `reject_booking_offer`). No WebView/JS needed. This depends on the phone not being force-stopped and the login session still being stored on the phone.
2. **Only about 1 in 3 sent offers is confirmed as received (LIVE, 7 days).** 364 offers sent, 124 with a phone receipt. By version: 10.0.02 = 29%, 10.0.01 = 17%, 7.0.0 = 55%, 6.0.64 = 61%, 7.0.4 = 60%. Many 10.0.02 offers ended "lost" (another worker took it first), which cuts short the receipt window, so part of the gap is not real non-delivery. The difference by version still needs an explanation on a real phone.
3. **The booking notification channel uses the normal notification sound, not an alarm (SOURCE).** Channel `booking_alerts` is HIGH importance but has no custom sound and no `USAGE_ALARM`. The loud ringtone plays only when the overlay or alert screen actually opens. If only the tray notification shows (overlay denied and background start blocked), the worker hears a normal ping at notification volume, or nothing in silent mode.
4. **No full-screen intent (SOURCE, by policy choice).** `USE_FULL_SCREEN_INTENT` is removed. On a locked phone without overlay permission, the native alert screen is started with a plain `startActivity()` from the background. Android 10+ normally blocks that, so the worker sees only a notification.
5. **The tray notification has no Accept/Reject buttons (SOURCE).** Tapping it opens the native alert screen. `NotificationReceiver` has accept/reject branches, but they only open the app and are not connected.
6. **The keep-alive cron does nothing (LIVE).** Job `fcm-keepalive-job` (every 30 min) posts to `https://YOUR_PROJECT_REF.supabase.co/...` with `YOUR_SERVICE_ROLE_KEY`. It is a placeholder, so no PING keep-alive pushes are sent and `worker-keepalive-ack` never gets data.
7. **Workers are still penalised for alerts that never reached the phone (LIVE).** See §3.3. The server also switches workers OFF when their heartbeat goes stale (LIVE: 5 workers paused for `heartbeat_stale`, 1 for `no_fcm_token` in the last 14 days), even though `dispatch.heartbeat_auto_offline_enabled = off`. The watchdog edge function doesn't read that setting.
8. **5 of the 6 workers inactive for 3–7 days have no push token (LIVE).** Their token was cleared after FCM said UNREGISTERED, or never synced. They can't be reached by push at all until they open the app.
9. **No Sunday/advance availability reminder or "confirm availability" feature exists (SOURCE).**

---

## 1. Android background behaviour

### 1.1 What the code does (SOURCE)

| Area | Implementation | Reference |
|---|---|---|
| FCM types handled | `BOOKING_ALERT`, `BOOKING_CANCELLED`, `BOOKING_REASSIGNED`, `PING`, `START_OTP_REMINDER_CANCEL` | `MyFirebaseService.java:74–365` |
| Message format | Data-only, `android.priority: HIGH`, transport TTL 60 s (offers), 7200 s (reminder cancel) | `send-fcm/index.ts:263–278` |
| Offer processing | `push_received` ack → `OfferQueue` persist + dedupe → tray notification → overlay (if allowed) else native activity | `MyFirebaseService.java:231–360` |
| Accept / Reject | Native REST RPC with stored JWT, native token refresh | `BookingAlertActivity.kt:589–723`, `BookingOverlayService.kt:954–1189` |
| Ringtone | `MediaPlayer` with `new_loud_ringtone`, `USAGE_ALARM`. **Only inside overlay/activity** | `BookingOverlayService.kt:1342`, `BookingAlertActivity.kt:440` |
| Booking channel | `booking_alerts`, HIGH, vibration on, public lockscreen, bypass-DND request, **default sound**, not versioned | `MyFirebaseService.java:508–525` |
| Cancellation channel | `booking_cancellations_urgent`, HIGH, voice file, `USAGE_ALARM` | `MyFirebaseService.java:527–550` |
| Channel creation | In `MyFirebaseService.onCreate()`. No `Application` class, so channels first exist when the first push starts the service | manifest |
| Full-screen intent | Removed (`tools:node="remove"`); no `setFullScreenIntent` | `AndroidManifest.xml:17–19` |
| Background activity start | Plain `startActivity` with NEW_TASK flags; no exemption | `MyFirebaseService.java:427–462` |
| Overlay service | Plain `startService` (not foreground) | `MyFirebaseService.java:353–360` |
| Heartbeat | WorkManager periodic, 15 min (Android minimum), needs network | `HeartbeatWorker.kt:24–58` |
| JS heartbeat | Every 30 min + on open/resume | `useWorkerHeartbeat.ts:6` |
| Boot / update | `BOOT_COMPLETED`, `MY_PACKAGE_REPLACED` → token sync + heartbeat + ack flush (only if logged in). `QUICKBOOT_POWERON` is handled in code but not registered in the manifest | `BootReceiver.kt`, manifest |
| Token refresh | `onNewToken` → `worker-boot-ping` + heartbeat | `MyFirebaseService.java:474–505` |
| Battery | Asks for `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`; no OEM autostart intents (only written guidance in Troubleshoot) | `BatteryOptimizationHelper.kt:51–69` |
| Notification permission | Checked before posting; reported in heartbeat | `MyFirebaseService.java:611–667`, `BackendSync.kt:556–618` |
| Channel health | Read natively (importance/sound), returned to JS only; **not sent to server** | `OverlayPlugin.java:309–341` |

### 1.2 What works in each phone state

| Phone state | Push arrives | Notification | Loud ringtone | Alert screen | Accept |
|---|---|---|---|---|---|
| App open | Yes (FCM + Realtime + polling) | Yes | Yes | Yes | Yes |
| Background (recent) | Yes (HIGH data push) | Yes | Yes if overlay allowed | Overlay if allowed; otherwise usually tray only | Yes, from overlay/screen |
| Swiped away / closed normally | Yes on stock Android; OEM-dependent | Yes | Overlay-dependent | Same as above | Yes |
| Locked screen, no overlay permission | Yes | Yes (heads-up/lockscreen) | **No** (normal notification sound only) | **Usually blocked** (Android 10+) | Only after tapping the notification |
| Doze (idle hours) | HIGH priority FCM is delivered, but Android may downgrade it if the app keeps not showing a notification (it always does, so OK) | Yes | As above | As above | As above |
| App Standby "restricted" bucket / OEM battery kill | **May be delayed or dropped** — NOT VERIFIED per brand | — | — | — | — |
| Force-stopped (Settings → Force stop, or some OEM cleaners) | **No.** Android delivers no FCM until the user opens the app again. Cannot be bypassed | No | No | No | No |
| Notifications turned off | Push arrives, the overlay can still show if allowed; no tray | No | Overlay only | Overlay only | Overlay only |

Manufacturer behaviour (Xiaomi/Redmi MIUI/HyperOS autostart, Vivo/iQOO "background power", Oppo/Realme ColorOS "auto launch", Samsung "sleeping/deep sleeping apps") — **NOT VERIFIED**. All of these can stop FCM delivery to a closed app until the worker allows autostart or adds the app to the "never sleeping" list.

---

## 2. Worker inactivity scenarios (1 / 3 / 7 / 15 days without opening)

Android puts unused apps into lower "standby buckets" (active → working set → frequent → rare → restricted). Android 13+ can also **auto-revoke permissions** and hibernate unused apps after ~3 months (not days). FCM tokens stay valid for months unless the app is reinstalled, data is cleared, or FCM marks them stale (~270 days inactive).

| Question | 1 day | 3 days | 7 days | 15 days |
|---|---|---|---|---|
| Receive push (not force-stopped, no OEM kill) | Yes | Yes, likely | Likely; "rare" bucket = HIGH pushes still delivered but limited | Possibly "restricted" bucket on Android 12+ → delays likely |
| Ringtone / alert screen | Same as §1.2 (needs overlay) | same | same | same |
| Accept from notification | Tap → native screen → Accept (no buttons on notification) | same | same | same |
| Session still valid for native Accept | Refresh token is stored; native refresh works if the token hasn't been revoked | same | same | NOT VERIFIED (refresh-token lifetime) |
| Token validity guarantees delivery? | **No.** A valid token only means Google accepted the message | | | |
| Reconnects on open? | Yes: heartbeat, token re-check (re-uploads only if missing/invalid/older than 7 days), Realtime, polling, setup gate re-reads permission + channel | | | |

**LIVE data by last seen:**

| Last seen | Workers | ON now | No token | Received a push in last 7 days |
|---|---|---|---|---|
| < 1 day | 29 | 15 | 1 | 18 |
| 1–3 days | 3 | 0 | 0 | 1 |
| 3–7 days | 6 | 0 | **5** | 0 |
| 7–15 days | 1 | 0 | 0 | 0 |
| > 15 days / never | 1 | 0 | 0 | 0 |

Workers inactive > 1 day are all OFF, so dispatch never offers to them. For Sunday, they must turn themselves ON (or be reached by a separate reminder).

---

## 3. Delivery tracking

### 3.1 What the phone reports (SOURCE)

| Event | Reported? | How |
|---|---|---|
| 1. Push received by Android | Yes | `push_received` → `ack-booking-delivery` (durable queue, 100 entries/24 h, retries) |
| 2. Notification/popup displayed | Popup yes (`popup_shown`); **tray-only display is not reported** | overlay/activity |
| 3. Alert opened / seen | `worker_seen` exists server-side, **no native sender found**; JS sends it when the app opens | — |
| 4. Accept / Reject | Yes: `accept_tapped`, `reject_tapped` + server final status | RPC + trigger |
| 5. Failed / unconfirmed | Server: `server_not_delivered`, `server_unreachable`, `server_lost`; phone: `overlay_blocked`, `popup_failed`; 20 s native watchdog → `report-missed-booking` | |

LIVE last 7 days (`booking_offer_events`): push_sent 258, push_received 80, popup_shown 88, worker_seen 47, server_accepted 44, server_lost 205, server_not_delivered 110, server_unreachable 59.
`popup_shown` > `push_received` means some receipt acks are lost even when the popup shows. So "no receipt" ≠ "not delivered".

### 3.2 Can the Admin Panel tell these apart?
The data supports it (one row per event per offer, deduped). Whether the Admin Panel shows each stage per offer is **NOT VERIFIED** here (separate project).

### 3.3 Penalties for alerts that never reached the phone (LIVE)

| Mechanism | Trigger | Effect | Fair? |
|---|---|---|---|
| `on_booking_request_ack_transition` | Offer times out with no phone receipt | `no_ack_count + 1`; at 3 → `push_deprioritized_until = +30 min` | **No** — penalises delivery failure |
| `detect_and_suppress_silent_workers` (on) | 3 silent offers in 15 min + heartbeat > 2 min | `push_deprioritized_until +30 min`, `silent_device` | **No** — same |
| `recalc_worker_priority_score_one` (every 15 min) | `no_ack_count × 2` (max 20), `not_reached × 5`, deprioritised `+15` | lowers priority score | Partly unfair |
| Reachability boost | Heartbeat < 3 min +8, ack < 30 min +5 | rewards phones that report often | Favours recent app use |
| `dispatch-pending-bookings` expiry | Any expired offer marked `timeout_no_ack`, **without checking receipt** | `consecutive_delivery_failures + 1`, 10-min cooldown | **No** |
| `worker-health-watchdog` | Stale heartbeat / no token / critical health | **Turns availability OFF** | Contradicts `heartbeat_auto_offline_enabled = off` |
| `recompute_worker_notification_health` | App not opened 24 h → −30 and "stale" | label only (dispatch says analytics-only) | OK, but misleading |

Today `no_ack_count` is 0 for nearly everyone (heartbeat and receipt both reset it), so the current impact is small. But the rules are still live.

---

## 4. Sunday worker recovery — what the current system can support

| Capability | Exists today? | Notes |
|---|---|---|
| Advance availability reminder (e.g. Fri/Sat) | **No** | Needs a scheduled server job + FCM *with a visible notification* |
| Worker confirms Sunday availability | **No** | Needs a small table + a button in the notification/app |
| Reliable push to inactive workers | Partly | Works if not force-stopped and the token exists; 5 of 6 recently-inactive workers have no token |
| Token re-registration on open | Yes | Native `onNewToken`, boot worker, JS sync (re-upload only when missing/invalid/older than 7 days) |
| Permission/battery diagnostics | Partly | Permission + battery sent in heartbeat; channel state, overlay, standby bucket, OEM not stored centrally; diagnostics queue is OFF |
| Worker instructions for blocked notifications | Yes | Troubleshoot page with Xiaomi/Oppo/Realme/Vivo/Samsung steps (no direct OEM settings links) |
| "Unavailable" vs "unreachable" separation | Display rules exist (`workerReachability.ts`), **server mixes them** (watchdog turns OFF) | |

Android facts that cannot be bypassed:
- A force-stopped app receives nothing until it is opened by the user.
- No API can wake an app or turn its notifications back on remotely.
- OEM autostart/background settings can only be changed by the worker.
- Full-screen alerts on the lock screen need `USE_FULL_SCREEN_INTENT`, which Play now restricts to calling/alarm apps (removed here by choice).
- SMS or phone call is the only channel that reaches a phone whose app is killed.

---

## 5. Previously known issues — current status

| Issue | Status |
|---|---|
| Android compile errors (stray ack code in `BackendSync.kt`) | Fixed in source (3 copies removed); static scan clean; **compile NOT VERIFIED** (no SDK here) |
| Booking channel uses normal notification volume | **Still open** (§0.3) |
| Missing receipt acks | Durable queue exists; still ~34% confirmed; acks partly lost (popup > receipt) |
| Notification permission disabled | 1 worker denied, 5 "unknown" (LIVE). ON switch blocked when permission/token unhealthy (SOURCE) |
| ON while delivery unconfirmed | Possible: "healthy" = permission + token, not a proven delivery |
| Priority penalties for missing acks | **Still live** (§3.3) |
| Lost opportunities due to connectivity | Yes: deprioritisation + watchdog OFF + reachability boost |
| Keep-alive PING | **Broken** — placeholder cron URL (§0.6) |
| Fallback passes `location` instead of `flatNo` when service start fails | Minor, open (`MyFirebaseService.java:360`) |

---

## 6. Final report

### 6.1 Confirmed technical issues
1. Booking channel has no alarm sound (default notification sound).
2. No working alert screen on a locked phone without overlay permission.
3. Tray notification has no Accept/Reject actions.
4. Keep-alive cron is a placeholder and never runs.
5. No-receipt timeouts lower ranking and cause 30-min deprioritisation.
6. Expiry sweep counts every expired offer as a delivery failure.
7. Watchdog turns workers OFF on stale heartbeat despite the setting being off.
8. Channel state (blocked/silent) is never sent to the server.
9. 6 workers without a push token (5 of them inactive 3–7 days).
10. Receipt rate on 10.0.02 (29%) is lower than on older builds (55–61%) — cause unknown.
11. No availability reminder / Sunday confirmation feature.

### 6.2 App bugs that can be fixed (Worker App, Android)
- New versioned channel `booking_alerts_v2` with `new_loud_ringtone` + `USAGE_ALARM` + vibration pattern (old channel kept for old notifications). Existing users' channel settings can't be changed in place; a new ID is required.
- Create channels at app start (custom `Application` or `MainActivity.onCreate`), not only on the first push.
- Add Accept/Reject action buttons on the booking notification using a native `BroadcastReceiver` that calls the same RPCs (no app launch).
- Send `notification_shown` for the tray notification, and `worker_seen` from the native screen.
- Report channel importance/sound, overlay permission, `UsageStatsManager` standby bucket and OEM in the heartbeat.
- OEM shortcut buttons (Xiaomi autostart, Vivo background, Oppo/Realme auto-launch, Samsung never-sleeping) with safe fallbacks.
- Register `QUICKBOOT_POWERON` in the manifest.
- Pass `flatNo` in the service-start fallback.

### 6.3 Server fixes (staged in docs only; never edit `supabase/functions/` from here)
- Fix the `fcm-keepalive-job` cron URL/key (or remove it) — it's the cheapest reachability signal.
- Only count `no_ack` when the offer expired **without** being taken by someone else (`lost` excluded) and when no `popup_shown`/`worker_seen` exists.
- Remove the ranking penalty for no-receipt (keep it for tracking only); keep penalties only for worker actions (reject/timeout after `popup_shown`).
- Make the watchdog obey `dispatch.heartbeat_auto_offline_enabled`; show "phone unreachable" instead of turning the worker OFF.
- Sunday reminder job + confirmation table (below).

### 6.4 Recommended notification & reconnection architecture
```text
Dispatch → FCM data (HIGH, ttl = offer ttl)
         → phone: receipt ack → alarm channel notification (+ Accept/Reject buttons)
                  → overlay (if allowed) → popup_shown → accept/reject RPC
Server state per worker:  Availability (worker choice)  ≠  Reachability (phone evidence)
  Reachability = last heartbeat, last keep-alive PING ack, last receipt, channel/permission/battery
  Unreachable workers stay ON, ranked last, flagged to Admin; never auto-OFF, never penalised
On app open: force token upload once per day, heartbeat, offer resync, setup gate
```

### 6.5 Recommended Sunday recovery process
1. **Thursday evening:** visible FCM notification "Are you working Sunday?" with Yes/No buttons to all active workers (including OFF ones).
2. **Saturday 6 PM:** repeat for workers who didn't answer; for workers with no token or no keep-alive ack in 48 h → **SMS/WhatsApp/phone call from ops** (the only path past a killed app).
3. **Yes:** opens the app → token refreshed → slots pre-filled for Sunday → worker turns ON (the existing mandatory-slots rule is kept).
4. **Sunday 6 AM:** reminder to confirmed workers who are still OFF. Admin list: Confirmed+ON / Confirmed+OFF / Unreachable / No answer.
5. Opening the app from any reminder fixes token, permission and channel checks.

### 6.6 Files/functions that would change
- Android: `MyFirebaseService.java` (channel v2, actions, shown ack, fallback flatNo), new `BookingActionReceiver.kt` (or rewrite `NotificationReceiver.java`), `MainActivity.kt` / new `Application` (channels), `BackendSync.kt` (heartbeat fields), `BatteryOptimizationHelper.kt` (OEM intents), `AndroidManifest.xml`.
- Web: `useFCMTokenSync.ts` (daily forced upload), `Troubleshoot.tsx`, new Sunday confirmation screen, i18n en/hi/te.
- Server (staged): `on_booking_request_ack_transition`, `detect_and_suppress_silent_workers`, `recalc_worker_priority_score_one`, `dispatch-pending-bookings`, `worker-health-watchdog`, `fcm-keepalive-job` cron, new reminder job + `worker_day_confirmations` table.

### 6.7 Risk
- New channel: workers may need to re-allow sound once; old builds keep the old channel. Low risk.
- Notification action buttons: accepting without seeing details → show price/flat in the notification text. Medium.
- Changing penalties: affects ranking order for everyone. Run in shadow mode first (`get_priority_shadow_comparison` exists). Medium.
- Watchdog change: unreachable workers stay ON and get offers that may not arrive; this is offset by ranking them last. Medium.
- Reminder pushes: too many visible pushes → workers mute the channel. Use a separate, non-alarm channel. Low.

### 6.8 Device test plan (all NOT VERIFIED)
Test on at least: Xiaomi/Redmi (HyperOS), Vivo, Oppo or Realme, Samsung (One UI 6+), one stock Android 14/15.
For each: app open · background · swiped away · locked 1 h · Doze overnight · battery "restricted" · autostart off · force-stopped · notifications off · overlay off · DND on · silent mode · reboot · 3 days unused (adb `am set-standby-bucket` rare/restricted to simulate 7/15 days).
Record: push received (ack row), sound type, popup/screen shown, Accept works, delay seconds.
