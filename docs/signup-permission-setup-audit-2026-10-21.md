# Worker App — Signup, Login & First-Time Setup Audit (2026-10-21)

Audit only. No code changed, nothing deployed, no production data touched.
Labels: SOURCE = read in code · NOT VERIFIED = needs Android build / real phone.

## A. Current flow (plain language)
1. **Phone + OTP** (`src/pages/Auth.tsx`, `src/pages/OtpVerify.tsx`): Firebase phone OTP. Unknown number → Sign Up (name, area, services, UPI). No admin-approval gate in the client (SOURCE); blocked workers see `WorkerBlocked`.
2. **App launch on Android** (`src/App.tsx` 258–333): automatically asks for **Notifications**, then **Physical activity** (system pop-ups, no explanation screen first).
3. **Setup screen** (`src/components/PermissionOnboarding.tsx`) is shown **only if "Display over other apps" is off** (`App.tsx` 231–235). It lists 2 steps: Booking Alerts (notifications) and Booking Popups (overlay).
4. **"START RECEIVING BOOKINGS"** (the Proceed button) appears only when both show granted; it re-checks the overlay only.
5. **Battery screen** (`src/pages/BatteryOnboarding.tsx`) appears over Home whenever battery optimisation is still on.
6. **Home checklist** (`src/components/OnboardingChecklist.tsx`): services, area, UPI, working hours — controls going online.

## B. Why only two steps
Intentional: overlay + notifications are on the setup screen; battery is a separate screen; activity is a launch prompt; no location or microphone is used (calls go through the phone dialer). But the gate is **inconsistent**: the screen lists notifications, yet the app decides whether to show / hide it using the overlay alone.

## C. Findings
| # | Issue | Evidence | Worker impact | Sev | Proposed fix |
|---|---|---|---|---|---|
| 1 | Setup gate ignores notifications | `App.tsx` 224–235 only checks overlay+battery; hide on resume when overlay granted | Worker with notifications off reaches Home, gets no booking alerts | **High** | Gate on notifications **and** overlay |
| 2 | Notifications "denied / don't ask again" = dead Enable button | `permissions.ts` 173 returns false immediately; no Settings path | Worker stuck tapping Enable, nothing happens | **High** | When denied, open app notification settings + show "turn on, then come back" |
| 3 | Notification permission ≠ alerts work | No check of `booking_alerts` channel being muted/blocked; token sync shown separately only in health badge | "Enabled" shown while channel is silent | Med | Check channel importance natively (`getNotificationChannel`) and show it in step 1 |
| 4 | Activity permission asked at every cold start with no explanation; on denial app auto-jumps to Android Settings | `App.tsx` 290, `permissions.ts` 408 | Confusing jump to Settings at launch; repeats each launch | **High** (UX) | Ask only when a booking is accepted (that's when movement tracking runs), never auto-open Settings |
| 5 | Battery "Give Permission" closes screen immediately, even if not changed | `App.tsx` 625–627 | Screen counts as done; re-appears on every app resume | Med | Close only after re-check on return; add "Later" (prop `onSkip` exists but is unused) |
| 6 | Battery screen duplicates language (hard-coded Hindi + Telugu under translated title) | `BatteryOnboarding.tsx` 40–47 | Hindi worker sees Hindi twice | Low | Remove hard-coded lines; use translations |
| 7 | "Enable" button text not translated | `PermissionOnboarding.tsx` 263 | English word for Hindi/Telugu users | Low | `displayText("Enable")` |
| 8 | Notification-denied warning is an English browser `alert()` | `App.tsx` 285 | Untranslated, technical-looking pop-up | Low | Remove (step 1 covers it) |
| 9 | Launch-permission "done" flag not reset on logout/account switch | `androidPermissionFlowRef` in `App.tsx` 206 | New account in same session skips launch prompts (real status is still re-checked by gate) | Low | Reset ref when user id changes |
| 10 | Opening Settings does **not** count as granted (good) | `PermissionOnboarding` refreshes on resume; overlay/battery use real status | — | OK | Keep |
| 11 | No completion flags stored locally (good); revocation is re-checked on resume + `usePermissionRegressionWatch` | SOURCE | — | OK | Keep |
| 12 | Manifest still declares `SYSTEM_ALERT_WINDOW` although project rule says it was removed for Play policy | `AndroidManifest.xml` 7 | Possible Play review conflict; overlay feature depends on it | **Decision** | Owner to confirm: keep overlay (and declare use in Play Console) or remove overlay step |
| 13 | `LocationTrackingService.kt` exists but no location permission / service declaration | android source | None now (dead code) | Low | Leave or delete later; do not add location |
| 14 | Rapid taps: Enable is disabled while busy; Proceed only re-checks → no bypass found | SOURCE | — | OK | — |

## D. Smallest fix set (priority order)
1. Gate setup on notifications + overlay (#1).
2. Denied-notification recovery via Settings (#2).
3. Move activity request to booking acceptance; no auto-Settings (#4).
4. Battery screen: re-check before closing + "Later" (#5).
5. Translation clean-ups (#6–#8), reset flag on account switch (#9).
6. Owner decision on overlay policy (#12). Channel check (#3) needs native code → next APK.

## E. Checks run
- `bunx vitest run`: 85/85 passed (none cover this setup flow).
- Android build: NOT RUN (no Android toolchain here). Nothing about overlays, pop-ups, OEM behaviour verified.

Real-phone checklist (PENDING): fresh install → deny notifications twice → confirm recovery; grant overlay then return → confirm screen stays if notifications off; revoke overlay in Settings → reopen app; battery screen on Xiaomi/Vivo/Oppo; logout → log in as another worker; reinstall + app update; booking alert sound with channel muted.

## F. Admin Panel / backend dependencies
None required for fixes 1–5. Optional: show workers' `notification_health` / token status in Admin Panel to spot "permission on but alerts not delivered".
