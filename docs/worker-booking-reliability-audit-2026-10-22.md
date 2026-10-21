# Worker App complete booking reliability audit — 2026-10-22

**Audit only.** No code, data, availability, bookings or notifications were changed or sent for this audit. Evidence labels: **LIVE** (read-only production query or harmless probe), **SOURCE** (this repo), **PRIOR** (earlier audit in `docs/`), **NOT VERIFIED** (needs a real phone or the Admin Panel project).

## Main answer

**Not reliably today.** A worker who is ON, has a valid token and has not opened the app for several days *is still offered bookings* — nothing in the dispatcher in this repo excludes her for inactivity. But:
1. The server cannot tell whether her phone received anything. Every device confirmation is refused by the live receiver (P0-1). So "unreachable / not_delivered / lost" offer statuses are based on missing confirmations, not on proof that the phone missed the alert.
2. A force-stopped app gets no FCM messages until the worker opens it herself. This is an Android rule and the app can't bypass it.
3. Battery saver / OEM background limits can delay or drop data-only pushes. Nothing in the app can guarantee delivery.
4. The dispatcher deployed in production is not the code in this repo (P1-1), so its freshness rules can't be fully checked from here.

**GO / NO-GO: NO-GO** for claiming reliable delivery after days of inactivity or a phone restart, until P0-1 is deployed and the real-phone checks in §10 are done.

---

## Report A — Worker inactivity

| Question | Finding | Evidence |
|---|---|---|
| Is there a 24h/48h freshness exclusion? | Not in this repo's dispatcher. Order is `priority_score, rating, last_offer_at`; the comment says app-open freshness is no longer a filter. | SOURCE `booking-notifications/index.ts:236-245, 309-312` |
| Is it off in production? | Deployed dispatcher logs `version=2026-10-21.quality-rank-50` and `freshness fields = SOFT priority only (bypass_toggle=false, now no-op)`. That text is **not** in this repo. It looks soft-only, but the code itself is not viewable. | LIVE edge logs; P1-1 |
| Hidden freshness check elsewhere? | `worker-health-watchdog` (every 2 min) turns workers OFF after `HEARTBEAT_STALE_MIN = 5` minutes without a heartbeat. Phones send heartbeats every 15–30 minutes. In effect it is a hidden freshness rule. 2 PHF workers are currently paused `heartbeat_stale`. | SOURCE `worker-health-watchdog/index.ts:29`; LIVE |
| Is "last opened" recorded accurately? | `last_app_opened_at` comes from the app. `last_seen_at` is also updated by background paths: Janaki last opened 10-03, but `last_seen_at` is ~2 days old. "Last seen" ≠ "opened app". | LIVE |
| FCM token after 7/15/30 days | FCM tokens survive inactivity but may be rotated; Google marks devices inactive after ~270 days. The app re-syncs the token on open, boot (`worker-boot-ping`) and keepalive. | SOURCE; external FCM docs |
| Background work after long inactivity | Android App Standby buckets ("rare"/"restricted") limit high-priority pushes and WorkManager. Keepalive every 30 min is subject to the same limits. | NOT VERIFIED on device |

PHF: no ON worker with a valid token has been inactive long enough (max 6.5 days, Mafiya) to test 7/15/30 days from data.

## Report B — Notification reliability

| State | Eligible | Backend sends | FCM accepts | Device receives | Popup | Confirmation recorded | Must reopen app |
|---|---|---|---|---|---|---|---|
| Foreground | yes | yes | yes | expected | expected | **no (P0-1)** | no |
| Background | yes | yes | yes | expected | expected (overlay optional) | **no** | no |
| Removed from recents | yes | yes | yes | usually; OEM-dependent | notification always posted | **no** | no (most phones) |
| Force-stopped | yes | yes | yes | **no — Android blocks it** | no | no | **yes** |
| Idle 24h / 7d / 30d | yes (no repo filter) | yes | yes | depends on standby bucket | — | **no** | NOT VERIFIED |
| Screen locked | yes | yes | yes | expected | notification only; lock-screen popup not promised | **no** | no |
| Battery saver / background restricted | yes | yes | yes | may be delayed/dropped | — | **no** | possibly |
| Process killed by Android | yes | yes | yes | expected (FCM wakes app) | expected | **no** | no |

"FCM accepts" means Google took the message (`push_sent`). It does not prove the phone got it. Every "Device receives" cell is **NOT VERIFIED** on a real phone.

Payload (SOURCE `send-fcm`): data-only for booking offers, `android.priority = HIGH`, `ttl = 60s`. With a 60-second TTL, a phone that is off or out of coverage for over 1 minute never gets the offer. That's correct for an offer that expires, but it means "phone off" ≠ "missed and retried".

## Report C — Availability toggle

ON ≠ connected ≠ dispatch-eligible ≠ delivered. Writers found (LIVE + SOURCE):

| Writer | Direction | Labelled as |
|---|---|---|
| Worker toggle → `update-availability` → `set_worker_availability_manual` | ON/OFF | `worker` (service role) |
| Busy recompute (job assigned / finished) | OFF / ON | `busy_recompute` |
| `worker-health-watchdog` | OFF (stale heartbeat, ≥3 misses, no token), restore ON | `system_auto_offline` |
| Admin Panel | ON | `admin_panel` |
| Logout (`AuthContext.tsx:272`) | OFF | direct write |
| `auto-heal-stale-workers` cron (*/3) | NOT VERIFIED (DB job, not in repo) | — |

Reasons a worker shows ON but gets nothing (LIVE PHF examples):
- No push token: Janaki, Ratnamma, Bharati, Prameela are ON with `fcm_token` missing. They can never be reached.
- `payout_ready != true`, blocked, busy, wrong service or community, or no slot for that time (SOURCE `:239-262`).
- `notification_permission_granted = false` **or `overlay_permission_granted = false` excludes the worker** (SOURCE `:243-244`). This contradicts the approved "popups optional" design (P1-2).
- Rating tiers: tier 2/3 only get offers if tier 1 is empty (PRIOR F3).
- Watchdog 5-minute OFF (P1-3).
- The app screen re-reads ON/OFF on resume and on a timer, so it can show ON for up to one interval after the server switched it OFF.

## Report D — Booking processing

| Area | Finding | Label |
|---|---|---|
| Accept authority | `accept_booking_authoritative` RPC, server decides, one winner | SOURCE/PRIOR |
| Reject | `reject_booking_offer` session-bound; core array-literal bug fix drafted, **not deployed** | PRIOR P0 |
| Expired offers | JS refuses expired offers (`offerFreshness.ts`); `get-pending-worker-bookings` previously re-served expired offers (PRIOR F9) — app-side guard added, server fix pending | SOURCE |
| Duplicate popups/actions | native once-per-offer dedup; JS ack dedup | SOURCE |
| Reconnect | app re-fetches pending offers after realtime reconnect (fix made earlier, not shipped) | SOURCE |
| OTP completion | V2 behind rollout switch; completion-lock patch drafted, **not deployed** | PRIOR |
| Busy after completion | `heal-stuck-busy-workers-hourly` exists, so a worker can stay busy up to 1 hour | LIVE cron |

## Report E — Prestige High Fields (LIVE, read-only, 30 days)

The full table is reproducible with the query in §Queries. Highlights:

| Worker | Avail | Token | Ver | Last opened | Sent 7d/30d | Push rcvd* | Popup* | Accepted | Suspected issue |
|---|---|---|---|---|---|---|---|---|---|
| Nagarani m | ON | ok | 10.0.02 | 10-21 | 132/197 | 38 | 35 | 15 | most offers, few accepts; 4.0 rating → tier 2 |
| B kalpana | ON | ok | 10.0.02 | 10-21 | 105/154 | 44 | 44 | 0 | receives but never accepts — unknown |
| Kavitha vadde | ON | ok | 10.0.02 | 10-21 | 51/102 | 4 | 4 | 2 | few confirmations even before 10-14 — device delivery suspect |
| Rajeswari bhukiya | OFF | ok | **7.0.0** | 10-21 | 82/82 | 0 | 0 | 21 | old app: never sends confirmations |
| Sumalatha moodu | OFF | ok | **6.0.64** | 10-21 | 25/124 | 36 | 29 | 22 | old app |
| Kalyani sapavath | ON | ok | 6.0.64 | 10-17 | 12/59 | 2 | 1 | 0 | auto-offline before; old app |
| Mafiya | ON | ok | 7.0.4 | 10-15 | 2/19 | 4 | 4 | 4 | inactive 6.5 d |
| Janaki vadderajulu | ON | **missing** | 7.0.0 | 10-03 | 0/15 | 0 | 0 | 1 | no token, paused `heartbeat_stale` |
| Ratnamma vadde | ON | **missing** | 7.0.0 | 09-30 | 0/1 | 0 | 0 | 0 | no token |
| Bharati bhairamollu | ON | **missing** | 6.0.64 | 09-12 | 0/0 | 0 | 0 | 0 | no token, paused `no_fcm_token` |
| Prameela bai pawar | ON | **missing** | 10.0.02 | 10-02 | 0/0 | 0 | 0 | 0 | no token + notifications denied |
| Ramya Sri, Jyothi G | ON | ok | 10.0.x | 10-21 | 0/0 | — | — | 0 | eligible but 0 offers — **unknown** (tier/slot/payout) |

\*Confirmations stop on 2026-10-14 for everyone (P0-1). Zero after that date is **not** proof the phone missed the alert. Phone power state can't be known: no reliable telemetry.

## Root cause list

**P0**
- **P0-1 Confirmation receiver refuses every current event (CONFIRMED, LIVE probe).** It only accepts `received`/`opened` and returns 400 for `push_received`/`popup_shown`/etc. Impact: no proof of delivery and misleading "unreachable" statuses. Fix: deploy the corrected receiver (Admin Panel). App fallback made last turn, not shipped. Backend change required.
- **P0-2 Reject-core array bug** (PRIOR, drafted, not deployed).

**P1**
- **P1-1 Deployed dispatcher ≠ repo source (CONFIRMED).** Freshness rules can't be fully checked. Fix: export the deployed source or audit from the Admin Panel project.
- **P1-2 Popup permission declined ⇒ excluded from dispatch (CONFIRMED in source; deployed NOT VERIFIED).** `booking-notifications/index.ts:244`. Conflicts with optional popups. Currently `overlay_permission_granted` is null for PHF, so nobody is hit yet. Workers who decline in the new setup will be. Fix: drop the overlay filter (backend).
- **P1-3 Watchdog stale threshold 5 min vs 15–30 min heartbeats (CONFIRMED source).** Causes OFF/ON flapping. Fix: threshold ≥ 2× heartbeat interval (backend).
- **P1-4 ON with no token (CONFIRMED LIVE, 4 PHF workers).** Fix: show "Booking alerts not registered" in Admin and in the app (app already shows it); never count as eligible.
- **P1-5 Force-stop blocks delivery (Android limitation).** Fix: guidance only.

**P2**
- `last_seen_at` updated without the app opening — misleading "connected" status.
- 60 s FCM TTL: offers sent while the phone is off are dropped, not retried later (by design; document it).
- Old app versions (6.0.64, 7.0.x) in use — they send no confirmations at all.
- Token invalidation too broad (PRIOR F7); keepalive with empty body rejected by `send-fcm` (PRIOR F6).
- Busy can last up to 1 h after a stuck completion (hourly healer).

**P3**
- "Never accepts" workers (kalpana) need a per-worker offer view in Admin.

## Phone OFF / restart (§3)

SOURCE: `BootReceiver` (BOOT_COMPLETED, MY_PACKAGE_REPLACED) → `FcmBootSyncWorker` → `worker-boot-ping` re-syncs the token without opening the app. Availability is not changed by reboot (no app writer). Offers sent while the phone was off expire within 60 s and are refused by the app's expiry check if shown late. Watchdog may switch the worker OFF after 5 min with no heartbeat. All **NOT VERIFIED** on device. Note: no `LOCKED_BOOT_COMPLETED`, so recovery waits until the first unlock after reboot.

## Test matrix (§10)

| Test | Expected | Status |
|---|---|---|
| Foreground / background / terminated delivery | notification + popup if allowed | Not tested (needs phone) |
| Force-stop | no delivery until opened (Android) | Not tested |
| Reboot without opening app | token re-synced via boot ping | Not tested |
| Power off > 60 s | offer dropped, no late popup | Not tested |
| Internet loss/recovery | re-fetch pending, realtime resubscribe | Offline test only (pass) |
| Long inactivity 7/30 d | still offered (repo); delivery subject to standby | Not tested |
| Availability ON/OFF | only by tap/admin/busy/watchdog | Source + live audit (pass with P1-3 caveat) |
| Expired FCM token | 404/UNREGISTERED → token cleared, health warns | Not tested |
| Expired login | native confirmations still sent with stored worker id | Source only |
| Expired offer | refused client-side | Offline test pass |
| Concurrent offers | one popup at a time, queue | Source only |
| Slow-network accept | server decides; one winner | Source only |

Offline suite: 117/117 passed (last run this session). Android compile: NOT RUN.

## Report F — Fix plan (approval needed)
1. Deploy the corrected `ack-booking-delivery` (Admin Panel). Ship the app fallback in the next APK.
2. Remove the overlay-permission dispatch filter (backend).
3. Watchdog stale threshold → ≥ 30–45 min (backend).
4. Deploy the reject-core fix and the expired-offer server fix.
5. Show "ON but no push token" in the Admin Panel and exclude those workers explicitly with a reason.
6. Force upgrade from 6.0.64 / 7.0.x.
7. Real-phone test pass (§10) on 2–3 OEMs (Xiaomi/Vivo/Samsung).

## Report G — Who owns what
| Change | Owner |
|---|---|
| ACK receiver, dispatcher filters, watchdog, reject core, pending-offer expiry | Supabase / Admin Panel |
| Legacy-ACK fallback, availability source tagging, health warnings, upgrade prompt | Worker App (done in source, not shipped) |
| FCM priority/TTL | send-fcm (backend) |
| Battery/OEM guidance | Worker App |

## Queries
PHF report: join `workers` (selected_community_id = PHF) with `booking_requests` grouped by `worker_id` over 7/30 days (sent, `push_delivered_at`, `popup_shown_at`, `status='accepted'`, status in `not_delivered/unreachable/lost`), plus `worker_availability` slot count — exact SQL as run on 2026-10-22.
