# Android build-readiness report — 26 Nov 2026 (prompt-144)

No code changed. V2 not activated, penalties off, dispatch/version untouched, nothing published.

## Results
| Check | Status | Evidence |
|---|---|---|
| Web app test suite | VERIFIED | 95 files, 1009 tests passed (vitest) |
| Native alarm timing rules (`StartOtpAlarmRulesTest`) | VERIFIED | 10/10 passed, JDK 21 + JUnit 4.13.2 + org.json |
| Native Java/Kotlin compile (`./gradlew assembleDebug`) | NOT VERIFIED | Android SDK could not be installed in sandbox (download failed) |
| Robolectric `StartOtpAlarmTest` | NOT VERIFIED | needs Android SDK + Gradle |
| Voice once at 10 min / continuous from 15 min | SOURCE + rules test only | needs device |
| Locked screen / background / restart / reboot / offline | NOT VERIFIED | needs device |
| Cached deadline never fires after complete/cancel/reassign | SOURCE + rules test | server-state cancel path unchanged; device check needed |
| Existing active bookings migrate to server deadline | NOT VERIFIED | needs device with old build installed |
| Priority Score V2 with real worker session | NOT VERIFIED | no signed-in worker session available here |
| Screenshots | NOT TAKEN | no signed-in session; isolated previews exist from prompt-142 |

## How to complete the Android checks (on your computer)
1. Pull latest code; `npm install && npm run build && npx cap sync android`.
2. Compile: `cd android && ./gradlew assembleDebug` (Java 21, SDK 36).
3. Tests: `./gradlew testDebugUnitTest --tests '*StartOtpAlarm*'` (includes Robolectric).
4. Install old Play build, accept a booking, then install this debug build over it → confirm countdown/alarms switch to the server deadline.
5. On the phone, for one instant and one early-accepted scheduled booking: lock screen, then minimise → voice once at 10 min, non-stop from 15 min; enter correct OTP → stops immediately; repeat with Admin cancel and reassignment → no sound.
6. Force-stop app, reboot phone, airplane mode on/off during the window → timings kept, never two sounds at once.
7. Sign in as a real worker → Profile → Priority Score: "Preview" label shown, official score unchanged, New Worker for unrated.

## Security dependency audit (SOURCE)
| Area | Finding |
|---|---|
| Booking access / OTPs | OK — bookings read via `WORKER_BOOKING_COLUMNS`; type omits `completion_otp`; Start/End OTP via server RPCs only |
| Payout records | OK — read-only, explicit columns, no client writes to `worker_payouts` |
| Customer info | OK — no `customer_phone` reads in app source |
| **Profile recovery / linkage** | **ISSUE** — `useWorkerProfile.ts` line 37 writes `workers.user_id` (self-link when id = uid) and `updateWorker()` always adds `user_id` to every profile update. Same-login only today, but breaks the "app never writes user_id" rule and will fail if Admin blocks that column |
| **Worker row reads** | **RISK** — `useWorkerProfile.ts`, `OtpVerify.tsx:233`, `BookingDiagnostics.tsx:45` use `select('*')` on `workers` (loads own FCM token, UPI/bank fields). Will break if Admin column-locks those fields |
| Signup phone lookup | RISK — `OtpVerify.tsx:233` reads another login's worker row by phone (`select('*')`) to detect conflicts; should become a server RPC returning only "taken/free" |
| FCM token | OK — written via `update_worker_fcm_token` RPC / own row only |
| Bank details | Own-row writes from Account Details/Signup; depends on Admin RLS for own-row only |

## Worker App changes needed for Admin's security corrections (PROPOSED, awaiting approval)
1. Remove `user_id` from `updateWorker()` payload and the client self-link; rely on `ensure_worker_profile`.
2. Replace `select('*')` on `workers` with an explicit column list (exclude fcm_token / bank fields where not shown).
3. Replace the signup phone lookup with an Admin RPC (e.g. `is_phone_registered`).
4. Move bank/UPI writes to an Admin RPC if Admin locks those columns.
