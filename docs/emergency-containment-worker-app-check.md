# Emergency Containment — Worker App Compatibility Check

Date: 17 Oct 2026. Scope: read-only. No code, permissions, bookings, deploys or publishes changed.
Labels: SOURCE = read from this repo · LIVE = read-only query on production `paywwbuqycovjopryele` · NOT VERIFIED = could not check here.

Input: `docs/phase6b-security-release-readiness.md` §5 (available). Containment = grants only:
1. Revoke anon/authenticated on `accept_booking_authoritative`, `atomic_accept_booking`
2. Revoke anon on `admin_set_booking_status`, `admin_reassign_booking_worker`
3. Revoke anon/authenticated on `repair_scheduled_dispatch_windows`

## 1. Accept / Reject entry points (SOURCE)
| Flow | File | Backend call | Auth |
|---|---|---|---|
| Foreground in-app card | `src/components/BookingCard.tsx` → `bookingActions.tryAccept` | RPC `try_accept_booking(p_booking_id)` | user JWT, no worker id |
| Foreground alert hooks | `useUnifiedBookingAlerts.ts`, `useBookingAlerts.ts` | `try_accept_booking` / `reject_booking_offer` | user JWT |
| Reopened app / native deep link | `src/App.tsx:421` → `tryAccept` | `try_accept_booking` | user JWT |
| Polling recovery list | `useBookingPollingFallback` → edge fn `get-pending-worker-bookings` (read only; accept still via `try_accept_booking`) | — | user JWT |
| Native overlay popup (background) | `BookingOverlayService.kt:1053 / 1186` | REST `rpc/try_accept_booking`, `rpc/reject_booking_offer` | refreshed user JWT |
| Native full-screen alert | `BookingAlertActivity.kt:709 / 642` | same two RPCs | refreshed user JWT |
| Notification buttons | `NotificationReceiver.java` | none — Accept opens the app, Reject only dismisses | n/a |
| Offer queue | `OfferQueue.kt` | none (presentation only; comment mentions `accept_booking_authoritative` as the server authority) | n/a |
| Telemetry | `booking_offer_open`, edge fn `ack-booking-delivery` | not touched by containment | — |

Grep of `src/`, `android/`, `supabase/functions/` for the five contained functions: only comments (OfferQueue.kt:25, get-pending-worker-bookings:88). **No Worker App path calls them.**

## 2. Server-side chain (LIVE)
- `try_accept_booking` = SECURITY DEFINER, owner postgres, granted to authenticated (not anon); calls `accept_booking_authoritative(p_booking_id, NULL)`. Runs as owner, so revoking client grants on `accept_booking_authoritative` does **not** affect it.
- `reject_booking_offer` = SECURITY DEFINER, authenticated; calls none of the contained functions.
- Only other caller of `accept_booking_authoritative` in the DB: `atomic_accept_booking` (itself being revoked).
- `repair_scheduled_dispatch_windows` caller: cron job `repair-scheduled-dispatch-windows`, every minute, runs as `postgres` → unaffected.
- Worker App status changes use `worker_set_booking_status` / `worker_collect_payment` — not in the containment list.

## 3. Dependency matrix
| Path | Uses contained fn? | Effect of containment |
|---|---|---|
| Accept (all 5 UI flows, 10.0.02) | No (`try_accept_booking`) | SAFE |
| Reject (in-app, overlay, alert) | No (`reject_booking_offer`) | SAFE |
| Notification Accept/Reject buttons | No backend call | SAFE |
| Reopened-app / recovery-window accept | No | SAFE |
| Scheduled window reopening (cron) | Yes, as postgres | SAFE |
| Job status / payment collection | No | SAFE (see §5 pre-existing issue) |
| Older apps that call `atomic_accept_booking` or `accept_booking_authoritative` directly | Possibly | AFFECTED — would get "permission denied" (this is the intended block) |
| Admin Panel (separate project) | Unknown | UNKNOWN — NOT VERIFIED |
| Edge functions outside this repo | Unknown | UNKNOWN — NOT VERIFIED |

## 4. Older versions (10.0.01, 7.0.4, 7.0.0, 6.0.64) — NOT VERIFIED
Their code is not in this repo. Needs APK inspection (or 7 days of API logs) to see whether any call `atomic_accept_booking` / `accept_booking_authoritative`. If they do, those workers lose Accept until they update — acceptable for a security block, but expect support calls. Force update stays off until 10.0.02 is on Play Store and device-verified.

## 5. Pre-existing LIVE finding (not caused by containment)
`worker_set_booking_status` and `worker_collect_payment` have **no execute grant for authenticated** (only postgres + service_role). The app calls them from `useActiveJob.ts:249` (start / on-the-way status) and `PaymentCollectionModal.tsx:28` ("Collected"). These buttons are expected to fail today with permission denied. NOT VERIFIED on a device. Report only — no change made; needs a separate decision.

## 6. Package A note (not containment)
The later Package A guard "require a pending, unexpired booking_requests row unless admin/service" would apply inside `try_accept_booking` (role is still `authenticated`) and would break the 30-minute recovery-window accepts offered by `get-pending-worker-bookings`. Must be reconciled before Package A, not before containment.

## 7. Recommendation
**GO for Worker App 10.0.02 compatibility with emergency containment** (SOURCE + LIVE).
Remaining conditions before applying (owner): confirm Admin Panel and external edge functions don't call the revoked functions with user/anon tokens; accept that unverified older versions calling the old accept functions directly will be blocked; monitor `try_accept_booking` success rate and "permission denied" logs for 15 min after; rollback = matching GRANT.
Nothing was applied.
