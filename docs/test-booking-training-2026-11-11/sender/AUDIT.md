# Test Booking sender — implementation status (11 Nov, approved build-out)

**Implemented and tested offline; NOT deployed, NOT enabled, nothing sent.** `PRACTICE_PUSH_ENABLED=false` in the app; the staged server refuses unless `PRACTICE_PUSH_SENDER=on`.

| Area | Status | Where |
|---|---|---|
| Sender core (own device only, idle twice, claim, no resend) | PASS (tests) | `staged/senderCore.ts` |
| Live adapters: login via Auth `/user`, worker by verified user_id only (exactly one), active-job + offer reads, FCM HTTP v1 via existing service account, 8 s timeout, redacted errors | PASS (mocked network) | `staged/adapters.ts` |
| Entry + request handling (CORS, size limit, extra fields refused, no secrets logged) | PASS (tests) | `staged/send-practice-notification/` |
| Durable journal: one outstanding attempt per login, advisory lock, server-only grants, rollback | Written, NOT applied | `staged/sql/` |
| App: sends only id + expiry + phone token fingerprint; shows server reason; logout clears session | PASS (tests) | `src/lib/practiceNotification.ts` |
| Phone: session bound to native login + token fingerprint; channel/permission check; atomic first-receipt (duplicate FCM ignored); token change ends session; overlay evidence only after attach; first outcome wins | SOURCE ONLY | `android/.../Practice*.kt` |
| Real booking priority: any non-ping FCM closes practice instantly | SOURCE ONLY | `MyFirebaseService.java` |
| Accept on closed app → opens practice details for same login (≤10 min) | PASS (tests) / SOURCE native | `App.tsx`, `TestBooking.tsx` |
| Android compile, sound, vibration, background/closed delivery | NOT VERIFIED | `DEVICE_TEST_CHECKLIST.md` |

Tests: `bun run test` → 42 files / 495 passed (28 new). Backup: `../backup/sender-implementation-before-2026-11-11.zip` (18 files, SHA-256 manifest verified).

Known limits: the phone's busy flag is time-windowed, so protection against a real job that started in the last 60 s relies on the server's two checks plus the 60 s expiry; force-stopped apps may not receive FCM until reopened.

---

# Earlier audit (kept for reference)

# Real Test Booking sender — audit and preparation only

## Decision
**GO for reviewing this preparation; NO-GO for enabling delivery.** Nothing deployed, no FCM test sent, no APK released, no live data changed. Existing `PRACTICE_PUSH_ENABLED=false` unchanged. The staged core is an offline, dependency-injected proposal, not a deployable Edge Function. It is not imported into application runtime.

## SOURCE / verified configuration
- Source reviewed: practice page, reducer, safety hook, native receiver/plugin/alert, MyFirebaseService early routing and OfferQueue read-only checks, repository send-fcm.
- Secret-name lookup confirms `FIREBASE_SERVICE_ACCOUNT_KEY` and `FCM_SERVER_KEY` exist. Values were not retrieved. **Credential validity, Firebase project match and live send-fcm source are NOT VERIFIED.** No accessible Firebase Messaging connector exists; none connected because this is preparation only.
- Repository send-fcm is unsafe to call for practice: accepts worker lists, adds production booking fields, uses notification blocks for unrecognised types and writes worker token health/fallback records. This is SOURCE, not proof the live version is identical. Reuse the configured Firebase project and reviewed authentication/transport only, not its dispatch endpoint or health writes.
- `use-mobile.tsx` explicitly imports React. The reported phrase is not present in that file; no diagnostic appeared in the available build/runtime logs. No TypeScript-only command was run.
- Backup: `../backup/sender-before-2026-11-11.zip`, 13 files with verified SHA-256 manifest; archive hash `9b5ef59852dc21c11c20f08ea78f98979d52e9e3e649994087c40d862437b129`.

## PROPOSED flow
1. Phone checks actual notification permission, practice-channel status, native capability, login, online connection and absence of real work. Generate a practice UUID and 60-second expiry; bind native prepared session to current login and native FCM token fingerprint. A fingerprint compares devices; it does not authorize identity.
2. Dedicated `send-practice-notification` verifies Supabase login with Auth getUser, resolves exactly one linked worker by verified user_id (no phone relinking), selects only that worker's `workers.fcm_token`, active status and Android platform. Client cannot supply worker ID, raw token, booking ID, OTP, price or target list. Match native token fingerprint to stored token; mismatch requires ordinary token sync before another test.
3. Read-only real-booking and offer checks, fail closed on errors. Atomically reserve a **practice-only** attempt journal before sending: unique login+practice ID and one outstanding attempt per login across new IDs/concurrent devices. This is idempotency, not a general rate limiter. The journal must be persistent; a process-local Map is insufficient. No migration is prepared or applied in this task. Permissions and atomic claim need separate reviewed implementation.
4. Recheck busy state and current token just before sending. Reuse existing Firebase project over FCM HTTP v1 through an approved secure transport. If gateway-backed credentials are selected later, use the connector gateway; never expose keys in the browser. Data-only `{type:PRACTICE_BOOKING,practice_id,expires_at}` (milliseconds), Android HIGH, remaining TTL at most 60 seconds. No top-level notification or real-booking fields.
5. Provider message ID proves only submission accepted. Record provider acceptance/failure/unknown in the separate journal. Preserve provider status/details, redact tokens before logs or worker-facing text. UNREGISTERED fails the practice attempt only; do not clear workers tokens, change dispatch eligibility or call production health services. Existing normal token repair remains separate. 429/5xx and uncertain timeouts are shown, not automatically resent. Replay/status lookup returns recorded evidence only; new attempts wait until the original attempt window ends.
6. MyFirebaseService's practice early return stays before BackendSync/ACK/OfferQueue routing. Native receiver checks prepared ID, expiry, current login/token binding and real-work safety, then atomically claims receipt so duplicate FCM messages cannot replay sound/overlay. Tray fallback is always retained where permission permits; optional overlay reuses production layout/ringtone/vibration, not production actions.
7. Native Accept/Reject persist practice-only outcomes. Explicit intent routes to `/test-booking`, restores the same practice ID and evidence after process death, then rechecks real work/login before continuing. Both OTPs stay local practice 1234. Clear on logout/account switch/expiry; never open real booking routes.

## Gaps that must be completed before enabling
| Area | SOURCE now | Required before enable |
|---|---|---|
| Current device | Client sends ID/expiry only | Native token fingerprint + server comparison; verify login binding |
| Sender | No deployed practice sender | Verified-session, worker lookup, durable claim/journal and transport adapters |
| Duplicate taps | Page-local action lock only | Durable per-login attempts + native atomic receipt dedupe; new IDs must not bypass |
| Permission | Plugin checks POST_NOTIFICATIONS; receiver checks global enabled | Check practice channel blocked/silent; prepare currently misses globally disabled channels |
| Cold process | Preferences keep ID/outcomes | Explicit practice navigation and JS hydration; current Accept opens MainActivity without practice route |
| Account change | Session not login-bound | Clear/validate native session on logout, account change and token rotation |
| Real job race | Server plan double-checks; native busy cache is time-windowed | Prove native authoritative active-work suppression while JS is dead; unknown must suppress, real offer preempts immediately |
| Evidence | Received/overlay booleans | Duplicate-safe, ID/session-bound timestamps; overlay proof after actual attached view, not merely constructing view |

The native busy cache is not proof that a long active booking is absent. Existing 250ms practice polling may briefly overlap a newly arriving real alert; strict immediate preemption requires approved native integration. These are blockers, not verified protections today.

## Evidence rules
- **Sending:** Passed only after provider acceptance and journal readback; uncertain timeout Not Verified, explicit refusal Failed.
- **Receipt:** Passed only from the matching native receiver, never inferred from sender HTTP success.
- **Alert display:** Passed only from the attached native alert for the matching session; tray posting does not prove overlay display.
- **Sound/vibration:** Human-observed on the phone; playback attempts cannot certify these.
- Never use booking_offer_events, delivery ACK endpoints, worker heartbeat, availability, rankings, earnings or payouts for practice evidence.

## Remaining Android tests — all NOT VERIFIED
Foreground, background, process killed/swiped away; Accept cold-start restores correct practice flow; Reject remains local; duplicate taps and duplicate FCM; expiry/delayed delivery; global/channel permissions denied; optional overlay denied; Doze/battery restrictions; audible ringtone/vibration and stop/release; stale/mismatched/rotating tokens; offline and timeout recovery; logout/account switch; active real booking (including long jobs), offer arriving during send/display, Start/End OTP; production offer preemption; eight evidence checks read back for same ID. Compare real bookings/offers/payments/payouts/worker state before and after authenticated device runs. Force-stopped apps cannot be promised FCM delivery until reopened.

## VERIFIED offline checks
`bun run test`: **40 files / 467 tests passed**, including all previous 442 and 25 sender-specific cases. Covers OFF switch, verified-login adapter refusal, strict input/60-second window, own-device matching, token changes, active/unknown work refusal, duplicate/busy claims, expiry, data-only exact payload, provider failure, unknown timeout and missing message ID. Adapter mocks do not prove actual authentication, concurrency safety, database permissions, transport credentials or device delivery. Latest preview build log: **build OK**. Reported UMD error not reproduced; no app source change was needed. Authenticated end-to-end checks unavailable here (`external_unmanaged`); no real notification sent.

## Approval boundary and undo
Review this proposal first. Separate approval needed to implement deployable adapters/journal and native blockers, followed by signed Android build/device checks, then deployment and finally enabling the switch. No future step is implied by this preparation. Undo removes `sender/` and its new test; runtime/native files unchanged. Original files are in the verified backup.