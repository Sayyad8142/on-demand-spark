# Worker Reconnection Reminder — Feasibility Audit & Plan (2026-11-04)

Status: PLAN ONLY. Nothing built, deployed, scheduled or sent.

## 1. Live facts (read-only, SOURCE = live DB)
- 40 workers; 10 have `last_app_opened_at` older than 72h; 2 of those are ON right now.
- 6 workers have no FCM token or token status not `active`.
- `workers.last_app_opened_at` exists, but it is NOT a clean app-open signal:
  - written by `src/lib/pushToken.ts` on every token sync (incl. 30-min self-heal timer),
  - written by `useFCMTokenSync` on mount,
  - written by the daily-duty RPC (migration 20260519082632) together with last_seen_at.
  A background-woken WebView or a timer could refresh it without the worker looking at the screen.

## 2. Feasibility (Android rules respected)
| Requirement | Feasible | How |
|---|---|---|
| Measure real opens | Yes | New column `last_verified_app_open_at`, written only by a new RPC called on Capacitor `appStateChange isActive=true` + visible document. Never by timers, FCM, boot or heartbeat. |
| 72h detection | Yes | Server job (every 30 min) selects workers with open older than 72h. |
| Closed-app reminder | Yes | Normal FCM notification (standard channel, default importance, no full-screen intent, no alarm sound). Tap opens app. |
| Red reminder screen + green "OK — Open App" | Yes, in-app only | Shown when app opens from the reminder tap or is already open while flagged. No overlay launch from background (Android 10+ blocks it; we will not try). |
| OK action | Yes | Runs existing token sync, heartbeat, notification diagnostics, connection refresh. Availability untouched. |
| Missing/invalid token → Admin | Yes | Insert into `worker_reconnect_followups` (admin-read via `has_role`) for phone/SMS follow-up. No push attempted. |
| Daytime + once per 72h | Yes | Send window 10:00–18:00 IST; `last_reconnect_reminder_at` guard ≥72h. |
| Stop when not scheduled | Yes | Skip workers with no saved availability slots in next 7 days, plus per-worker `reconnect_reminders_paused` (worker toggle in Profile + admin). |
| Auto availability change | Not done | Explicitly excluded. |

## 3. Limits (NOT VERIFIED until phone test)
- Force-stopped app: Android delivers no FCM until the worker opens it manually. Unfixable by design — these workers go to Admin follow-up after one unacknowledged reminder (no `push_received` within 24h).
- OEM battery savers (Xiaomi, Vivo, Oppo) may delay or drop the notification.
- Workers on older builds get the plain notification but no red screen.

## 4. Proposed implementation
App (this project):
- `src/lib/reconnectReminder.ts` — pure rules (due?, in window?, paused?, followup reason) + tests.
- `src/hooks/useVerifiedAppOpen.ts` — calls `record_verified_app_open` on true foreground (debounced 10 min).
- `src/components/ReconnectReminderScreen.tsx` — red-themed screen, big green "OK — Open App"; route `/reconnect`.
- FCM handler: `type: RECONNECT_REMINDER` → standard notification with deep link `/reconnect`.
- Profile toggle "Pause reconnect reminders".
- en/hi/te strings.

Backend (STAGED as docs, needs GO):
- Columns: `last_verified_app_open_at`, `last_reconnect_reminder_at`, `reconnect_reminders_paused`.
- RPC `record_verified_app_open()` — worker from session.
- Table `worker_reconnect_followups` + RLS admin-only.
- Function `run_reconnect_reminders()` (service role) + cron every 30 min; sends via existing send-fcm.
- Initial backfill: `last_verified_app_open_at = null` → treated as "unknown", no reminder until 72h after rollout (avoids blasting everyone on day 1).

## 5. Rollout
1. GO for app code (no live effect; switch `RECONNECT_REMINDER_ENABLED=false`).
2. GO for migration (column + RPC only; job not scheduled).
3. Build APK, phone test (app closed, locked, force-stopped, paused, no token).
4. GO to schedule the job with dry-run (logs who would be reminded, sends nothing) for 3 days.
5. GO to send live.

Rollback: unschedule cron; set client switch false. No booking, dispatch, payout or availability data touched.

## Open questions for owner
1. Daytime window 10:00–18:00 IST OK?
2. "Not scheduled" = no saved slots in next 7 days — OK?
3. Should workers be able to pause reminders themselves, or admin only?
