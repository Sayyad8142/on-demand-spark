# Worker App payout, onboarding and Cashfree IMPS audit

**Date:** 26 November 2026. Read-only snapshot approximately 07:29–07:33 UTC (12:59–13:03 IST).

**Decision:** Not ready to activate Cashfree IMPS or promise daily payouts. Existing collection, payout execution, scheduling and worker displays need coordinated corrections. Awaiting your approval; nothing has been implemented or activated.

## Scope and evidence

The attached request is an audit, not permission to implement. No application code, database rows, settings, policies, scheduled jobs, deployed functions, app versions or payment records were changed. No account details were saved, beneficiaries registered, OTPs submitted, notifications sent, payouts initiated or app published. This report and its checklist are the only project changes.

Evidence labels:
- **LIVE READ:** Current database definitions, permissions, configuration, scheduler metadata or anonymous aggregate counts inspected with SELECT only. This is not an end-to-end transfer test.
- **SOURCE:** Current repository code; not proof that the same function or Android bundle is deployed.
- **TESTED:** Existing automated tests actually run during this audit, using mocks.
- **PRIOR:** Earlier handoff information, not independently reverified here.
- **PROPOSED:** A change recommended for approval, not implemented.
- **NOT VERIFIED:** Missing authenticated, provider, installed-device or hosted-function evidence.

No worker names, phone numbers, account numbers, UPI IDs, credentials or beneficiary identifiers are included.

## Executive findings

1. **The live provider configuration does not match the proposed starting point.** Cashfree is already the active provider and the UPI provider; RazorpayX is still configured as the bank-transfer provider. Both provider enable flags are true. This is not a verified RazorpayX-UPI-to-Cashfree-IMPS switch.
2. **First-ten/daily classification already exists on the server**, and hybrid mode is on. It allocates the first ten payout-linked earnings to instant slots, then subsequent earnings to daily settlement. It does not explicitly restrict the allowance to newly onboarded workers.
3. **Automatic transfer execution is disabled.** Neither an instant slot nor a prepared earning means money was sent.
4. **Daily preparation is broken.** All 45 retained scheduler runs failed with `ERROR: forbidden`; there are no settlement batches. The job is scheduled at 7:05, 7:15 and 7:25 PM IST, not exactly 7 PM.
5. **UPI collection cannot currently be disabled consistently.** Signup, profile and payout settings still require UPI. The existing Admin flag hides bank collection on signup, not UPI.
6. **46 of 50 workers have UPI but lack valid bank details according to the live bank-validation helper.** Only four have format-valid bank details. No worker has `bank_details_verified=true`; that flag alone does not establish provider verification either.
7. **Payout details still affect booking acceptance on the server.** The live acceptance routine rejects workers whose `payout_ready` is false. Client-side removal of a gate is insufficient.
8. **Current money screens are still legacy/per-booking displays.** The prepared hybrid interface is switched off, and worker table-read policies exclude consolidated daily and manual payout rows. Simply enabling the hybrid cards would leave conflicting legacy totals and displays.
9. **The shared worker profile omits `payout_ready`.** Home and Profile read it anyway, so real workers can be shown as not payout-ready despite the server saying otherwise.
10. **Bank OCR has side effects and privacy issues.** In source, extracting a saved passbook writes bank fields immediately, before the worker taps Save, and does not check the update error. These writes may trigger beneficiary synchronization.

## 1. Existing collection screens

| Surface | Current behavior — SOURCE | Required change — PROPOSED |
|---|---|---|
| Registration, `src/pages/Auth.tsx` | Step 2 offers QR upload/manual UPI. Both advancing to Step 3 and sending signup OTP require valid UPI. Bank fields appear as a collapsed optional fallback. | Use an Admin-supplied collection policy across the flow; hide UPI inputs and QR controls when off. Offer the existing bank form without requiring a UPI ID. Allow payout setup to be deferred without bypassing ordinary signup/approval requirements. |
| Signup confirmation, `OtpVerify.tsx` | Writes submitted UPI and optional bank fields. Returning-worker updates preserve the saved UPI if no new value is supplied. New workers start availability OFF. Signup leads to Availability. | Preserve this non-destructive UPI behavior. Omit hidden UPI fields from updates, never send null/empty values that clear saved IDs. Admin must remain authority for payout readiness. |
| Onboarding checklist | UPI or nonempty holder/account/IFSC counts as payout setup complete; text says “Add UPI ID for payouts” under “Complete setup to receive bookings.” | Separate booking readiness from payment readiness. Describe missing bank details as payment-only; use a server readiness summary rather than inferring bank readiness from nonempty strings. |
| Profile edit | UPI ID is marked required; save refuses an empty ID or one without `@`. It saves UPI alongside other profile edits. | Disable/hide UPI editing when collection is off without preventing a name/photo edit or erasing saved UPI. Provide a bank-details destination. |
| Payout settings, `/account-details` | UPI is mandatory; bank details optional. Supports holder name, account/re-entry, IFSC, bank name, passbook/cheque upload and extraction. | Reuse the bank fields as the primary IMPS form; validation must not require an invisible UPI field. Existing UPI values must remain stored. |
| `PayoutSetupCard.tsx` | A separate bank-first form exists with optional UPI and direct worker updates. | No current caller was found. Do not treat this unused component as the active bank screen or assume it already implements the migration. |
| UPI QR component | Upload/replace/remove and QR-extracted UPI updates exist in source; Profile imports it but no rendered usage was found. Signup uses its own QR flow. | Hide all active UPI collection paths under the policy, retaining legacy code and stored IDs/QR data. |

An unused `skipSignupPayoutDetails` function clears fields and advances, but no caller was found; the later OTP submission handler still requires UPI. It is not evidence of a functioning payout-free signup.

The only collection setting found is `app_config.enable_bank_payout_details`, currently true. `Auth.tsx` reads it once, defaults to showing bank details on error and uses false to hide the bank fallback. No worker-readable UPI collection toggle was found, and other collection screens do not share this setting.

## 2. Bank validation and backend connections

### Current validation

**SOURCE:** Account Details requires a holder name of at least two characters, a 9–18 digit account number, matching confirmation and IFSC matching `^[A-Z]{4}0[A-Z0-9]{6}$`. Account input strips nondigits; IFSC is uppercased. Bank name/passbook are optional. Signup uses schema validation and an account-number confirmation too.

**LIVE READ:** `worker_has_valid_payout_details` additionally restricts holder names to a Latin-letter-based expression, 2–100 characters. The display forms are not uniformly aligned with this rule. A valid-looking format is not confirmation that the account exists, belongs to the worker, supports IMPS or is an approved Cashfree bank beneficiary.

`set_worker_payout_ready` currently considers either a UPI containing `@` or valid bank details sufficient, unless bank status is blocked/rejected. Valid bank details can receive `bank_verification_status='auto_approved'`. This is automatic format-based approval, not proof of a provider bank check. The live Admin “mark ready” function uses yet another bank/UPI check.

**PROPOSED:** One server-owned IMPS readiness decision should distinguish missing details, submitted details, provider verification/beneficiary readiness, blocked details and execution paused. A saved UPI must not satisfy bank-only IMPS readiness. None of these payment states should decide booking eligibility.

### Current connections

- **SOURCE:** Account Details reads explicit payout columns for the worker's own row and saves through `updateWorker`. Its query cache uses zero stale/garbage-collection time. Client payloads still contain `payout_ready=true`; signup and the unused payout form also send readiness values. The sanitizer strips identity fields, not readiness fields.
- **LIVE READ:** A protected-field guard and payout-readiness trigger exist. Client-written readiness must not be relied upon as authoritative; exact save/readback behavior under their ordering and guard mode needs authenticated testing.
- **LIVE READ:** Worker changes can invoke `trigger_cashfree_beneficiary_sync`, which posts to `sync-cashfree-beneficiary`. It uses a public caller token plus worker ID. The deployed receiver's authentication, trusted-trigger verification, bank-versus-UPI registration and replay controls were not verified. Do not assume it is safe or IMPS-ready solely because the trigger exists.
- **LIVE READ:** All 50 workers have a Cashfree beneficiary ID, but the identifier does not reveal whether it is a UPI or bank beneficiary or currently usable. No provider account or secret values were inspected.
- **SOURCE:** The older `create-worker-payout-account` function remains RazorpayX-specific: creates a contact and UPI/VPA fund account; requires UPI and RazorpayX credentials. No frontend invocation was found in the inspected collection paths. Preserve it, but do not reuse it for Cashfree IMPS or test it against production.

### Passbook and privacy findings

- **LIVE READ:** `worker-passbook` is private. Policies scope workers to their auth-ID folder and allow Admin reads. The bucket has no explicit file-size or MIME restriction; UI restrictions alone are not a storage enforcement boundary.
- **SOURCE:** UI accepts JPEG/PNG/WebP/PDF up to 8 MB; preview URLs expire after one hour. Stored values are paths rather than expiring signed URLs.
- **SOURCE:** The saved-passbook extraction branch checks login, folder and worker ownership, then writes extracted fields with elevated access before the Account Details form is saved. It ignores the database update result. The form can report extraction success without confirmed persistence, and extraction can trigger beneficiary changes.
- **SOURCE:** The pre-signup base64 extraction branch occurs before the handler's login check. Gateway authentication/rate limiting in the deployed function is NOT VERIFIED. Audit abuse controls, payload limits and consent before expanding use.
- **SOURCE:** Signup stores account number, confirmation, holder name and IFSC in localStorage drafts, without an expiry in the shown draft code. Review retention, logout/shared-phone exposure and secure native storage; do not unnecessarily retain confirmation values.
- **SOURCE:** Passbook replacement deletes the previous file before the replacement upload and form save complete. A failed replacement can leave the old saved path pointing to a deleted object. Stage replacement safely after approval.

## 3. Existing first-ten / instant payout logic

**LIVE READ:** `_hybrid_record_earning` runs after a legacy/instant per-booking payout is inserted. It uses a per-worker advisory lock, a milestone row and a booking-exists check to prevent repeat classification. If `instant_slots_allocated < 10`, it allocates the next slot (1–10) and records a prepared instant earning. Otherwise it records a daily earning and holds the per-booking payout for daily settlement.

Important distinctions:
- The allowance is ten **allocated earnings**, not ten successfully paid transfers. Failed/unpaid slots are not automatically replaced by this classifier.
- Classification is triggered by payout-record creation, not directly by every completed booking. `_create_worker_payout_core` requires completion plus customer-payment/collection eligibility. Therefore the first ten allocated earnings can differ from the first ten chronological service completions when payments arrive late/out of order.
- No new-signup-date or migration-cohort restriction appears in the classifier. Existing workers can have milestones too.
- No bank-detail requirement appears in the classification routine. Recording/allocating earnings and executing the transfer are separate concerns.
- Old earnings use a legacy path. Do not reset existing milestones or reclassify paid history without an approved migration policy.

**LIVE READ snapshot:** 23 workers have milestones; nine have exhausted ten slots. There are 139 allocated slots and 97 settled slots, including historical state. These totals are not proof that the current automatic transfer path works.

**PROPOSED:** Admin must explicitly define the qualifying cohort, count basis, handling of deferred bank setup/refunds and migration date. Keep counting, allocation and settlement entirely server-side. The app only displays the server's mode, allocated/settled/remaining counts and confirmed outcomes.

## 4. Current live configuration and daily scheduling

| Setting — LIVE READ | Current value |
|---|---|
| Active provider / UPI provider | Cashfree / Cashfree |
| Bank-transfer provider | RazorpayX |
| RazorpayX enabled / Cashfree enabled | true / true |
| Payout preference / provider fallback | `upi_first` / false |
| Automatic payouts | false |
| Hybrid mode | `on` |
| Daily preparation | true |
| Bank execution | false |
| Auto retry / backlog processing / test transfers | false / false / false |
| Manual recording | true |
| Settlement cutoff | 19:00:00 IST |

`payout_bank_execution_allowed()` requires both bank execution and automatic payouts. Both are off. This is a transfer pause, not evidence that earnings are unrecorded.

**Daily preparation — LIVE READ:**
- `prepare_daily_settlement(date)` prepares one consolidated payout per worker/batch, links earnings via payout items, uses locks/idempotency safeguards, and explicitly returns `bank_called=false`. Preparation alone never means paid.
- Earnings completed strictly before the cutoff qualify. Completion at exactly 7 PM goes to the next date under the current earnings reader; post-cutoff completions do too.
- The scheduler timezone is GMT. `35-55/10 13 * * *` runs at 13:35/13:45/13:55 UTC, which is 7:05/7:15/7:25 PM IST.
- All 45 retained preparation runs failed with `ERROR: forbidden`; latest retained run: 25 Nov at 13:55 UTC. Zero batches exist. The function requires service-role or a session with Admin role. Admin must correct the job's authorized invocation and verify results; the exact invocation fix was not executed.
- Retry and payout-status synchronization jobs are inactive. Payout alert monitoring is active. Provider callback delivery/reconciliation remains NOT VERIFIED.

**Execution risk — LIVE READ:** Two auto-payout AFTER INSERT triggers invoke the same routine. Both currently exit because automatic payouts are off. They sort before `zz_hybrid_record_earning`; enabling auto payouts without a coordinated review could enqueue duplicate execution requests, or enqueue a per-booking transfer before the daily hold is applied. This is a source/definition risk, not a claim that duplicates have already been paid. Admin must verify receiver idempotency and ensure only classified, approved instant/batch payouts are executable.

## 5. Earnings, balances and payout history

### Current worker displays — SOURCE

Earnings, Profile and Bookings share `useWorkerPayouts` and `payoutDisplay` for server-record totals. Reads are paginated (1,000 rows per query, bounded at 50 pages), refreshed on foreground/reconnect and subscribed to worker-specific payout changes with cleanup.

Paid requires a recognized paid status **and server `paid_at`**. Awaiting, processing, held, failed and reversed are distinct. References come from manual UTR/reference/external reference, not invented values. These protections should remain.

Current summaries aggregate payout records by their `created_at` in IST, not earning completion date. Failed/reversed rows are excluded from the main earned total. Missing payout records appear as clearly labelled estimates, outside totals. Active Job and some booking amount fallbacks still use a community-fee calculation; they are estimates, not authority for actual paid earnings.

### Material hybrid gaps

- **LIVE READ:** Worker SELECT access to `worker_payouts` allows only own instant/legacy rows with a booking ID. It deliberately excludes daily batches (no booking ID) and manual consolidated rows. Direct `worker_earnings`/payout-items reads are Admin/service scoped; worker access belongs through authenticated own-worker RPCs.
- **SOURCE:** The prepared hybrid interface is OFF (`HYBRID_PAYOUT_UI_ENABLED=false`). Current Earnings, Profile and Bookings do not consume the hybrid earnings ledger for their main totals.
- **SOURCE/LIVE READ:** Daily per-booking held rows remain visible through the legacy reader. Even once a batch settles, legacy history shows individual booking rows rather than the actual consolidated transaction. Simply turning on hybrid cards beside legacy summaries would show two different concepts and potentially conflicting totals.
- **SOURCE:** The prepared section calls summary/history/detail, but not `get_my_earnings`, and is not yet a full replacement for booking-linked earnings, week/month/lifetime totals or pending-record handling.
- **SOURCE:** Its daily heading hardcodes 7 PM despite the server cutoff being configurable. Legacy payout types map to “Instant payout”; unknown future types do too. Unknown provider/batch data must not be relabelled as instant.
- **SOURCE:** Hybrid refresh is initial-load based, unlike the current foreground/realtime reader. Detail errors are silently ignored; pagination failure ends further paging; after any initial failure the section disappears. Verify useful retry/fallback behavior before activation.
- **SOURCE:** Parser validates fields but has no explicit contract-version field, and the summary shape lacks week/month/lifetime totals and a payment-detail readiness reason. Extend/confirm the Admin contract rather than inventing these values locally.

### Aggregate ledger snapshot — LIVE READ

| Payout records | Count | Amount INR |
|---|---:|---:|
| Instant / created | 42 | 7,013 |
| Instant / held | 49 | 8,257 |
| Legacy / created | 147 | 30,596 |
| Legacy / pending | 1 | 120 |
| Legacy / processing | 38 | 7,561 |
| Legacy / failed | 107 | 20,020 |
| Legacy / paid, all with paid_at | 221 | 34,710 |

The earnings ledger has 49 daily awaiting earnings (INR 8,257), 42 instant prepared earnings (INR 7,013), and 514 legacy earnings across awaiting/failed/paid/processing. No batch records exist. Payout records and earnings are related representations of the same money; **do not add these tables together** or interpret failed/historical totals as an amount authorized to pay.

## 6. Status notifications and transaction details

**SOURCE:** Earnings shows an in-app success toast when a realtime payout change arrives with confirmed paid status/paid_at, deduplicated per payout while mounted. It is not evidence of push delivery when the app is closed. Current failure action is “Update UPI”; no worker-triggered payout retry was found in this screen.

Completion receipt recognizes IMPS/NEFT/RTGS/bank as “Bank Transfer” if the server supplies a method, but otherwise defaults to UPI. The repository completion-function response does not include the payout method; its fallback payout creation hardcodes UPI. Current live DB payout creation also defaults to the worker's preferred method or UPI. The hosted edge implementation's exact parity is NOT VERIFIED. Receipt status remains server-confirmed, but the displayed transfer method can be wrong.

**PROPOSED:** Server responses should supply method/provider, payout type, payout ID, status/paid_at, amount, scheduled settlement, bank-masked destination and confirmed bank UTR/reference where applicable. Completion should say earnings were recorded/await payout, not imply an IMPS transfer occurred. One daily transaction should expand to its included booking earnings. Preserve old per-booking history and label legacy/manual transactions accurately. Provider webhook events and status reconciliation must be verified before promising timely notifications.

## 7. Existing workers without bank details

**LIVE READ:** 50 workers total; all have saved UPI and `payout_ready=true`. Four pass the live bank helper; 46 do not. All have a Cashfree beneficiary ID, but bank beneficiary readiness is not established. No bank-blocked/rejected worker exists in this snapshot, and `bank_details_verified` is false for all 50.

**PROPOSED:** Preserve every saved UPI/QR, provider ID, earning and historical payout. Prompt the 46 affected workers for bank details without turning them OFF or withholding bookings/completion. Keep newly recorded earnings pending until Admin says the bank destination is ready. Decide whether unpaid first-ten earnings are paid separately on submission, consolidated, or handled through another approved backlog policy. Do not silently convert those earnings into daily mode or execute a historical backlog.

## 8. Do missing payout details block bookings?

| Path | Finding | Evidence |
|---|---|---|
| Availability ON | Client payout/onboarding warnings are soft; ordinary approval, real slots, internet and alert-health checks remain. | SOURCE |
| New-offer coordinator, Home listeners, backup poller | Prior payout gates were removed from the app. | SOURCE / PRIOR handoff |
| Acceptance | `try_accept_booking` delegates to live `accept_booking_authoritative`, which refuses `payout_ready=false` with “Please add valid bank details before accepting bookings.” | LIVE READ — confirmed blocker |
| FCM sender | Repository `send-fcm` skips workers not payout-ready. Hosted source/version not downloaded. | SOURCE — live parity NOT VERIFIED |
| Next-tier escalation | Repository `notify-next-tier` filters `payout_ready=true`. | SOURCE — live parity NOT VERIFIED |
| Missed-offer recovery | Previous handoff identifies a payout gate; current heartbeat copy is not enough to certify the recovered production path. | PRIOR — current hosted path NOT VERIFIED |
| Completion/earnings recording | No missing-bank gate found in inspected client completion path or live DB earning core; customer payment/collection eligibility remains separate. | SOURCE / LIVE READ; complete hosted OTP flow NOT VERIFIED |
| Diagnostics | `workerReachability` still marks missing payout readiness as not eligible; should change only after confirmed server booking-gate removal. | SOURCE |

All current workers are server payout-ready, so this snapshot does not exercise the missing-details case. Test approved workers with bank/UPI absent in an isolated approved environment after corrections, while retaining suspension/approval/slot/OTP/customer-payment safeguards.

### Home reminder inconsistency

**SOURCE:** Home retains a nonblocking payout reminder card, hidden for guests and during an active job. Its wording says bookings can be received now and details are needed to get paid. The requested “popup” was not found as a separate payout modal in the inspected current paths; confirm whether this means the current Home card or a specific older popup.

`WORKER_PROFILE_FIELDS` excludes `payout_ready`, account holder/account/IFSC and verification state, yet Home/Profile use the missing readiness property. This can produce false reminders; the checklist also cannot know bank readiness for a future bank-only worker from that profile. Use a small server-controlled readiness summary rather than putting full bank details back into shared profile reads.

## 9. Admin-controlled settings and required connections

Existing controls should be reused where safe; no new production settings were added.

**PROPOSED worker-readable, privacy-safe contract:**
- UPI collection enabled/disabled, independently of bank collection.
- Bank collection enabled and whether deferral is allowed.
- Actual worker payment setup state and next action, separate from booking eligibility.
- Transfer method/provider and execution-paused state.
- Worker payout mode, first-ten limit/allocation/settled/remaining counts.
- Authoritative next settlement time/date/label and cutoff rule.
- Server earning totals, pending categories and paginated earning/history/detail results.
- Contract version and consistent status/reference/failure semantics.

**Existing live worker RPCs:** `get_my_payout_summary`, `get_my_payout_history`, `get_my_payout_detail`, `get_my_earnings`. All allow authenticated execution and refuse anonymous execution. Their definitions derive worker identity through `_my_worker_id` and scope data to that worker. `_my_worker_id` uses `workers.user_id=auth.uid()::text` only; legacy id-only accounts need linkage recovery, not a client-supplied worker ID. Actual worker-session response/readback has not been tested.

**Admin responsibilities before activation:**
1. Approve cohort, count, cutoff, deferred-bank and backlog policy.
2. Provide shared worker-readable collection/readiness policy; do not expose provider secrets or rely on local client flags.
3. Correct provider routing for Cashfree bank/IMPS without deleting or inadvertently activating RazorpayX functionality.
4. Verify bank beneficiary registration/validation, trusted trigger authentication, provider credentials/environment and callbacks. Credential values were deliberately not fetched.
5. Remove payment-detail gates from booking acceptance and all hosted delivery/escalation/recovery paths, preserving ordinary worker eligibility and OTP/customer-payment rules.
6. Repair daily scheduler authorization, timing, preparation and separately gated execution.
7. Review duplicate triggers and trigger ordering, immutable earning history, payout-item linkage, idempotency, retries/timeouts and “unknown bank result” handling. Never retry an unknown transfer as if it definitely failed.
8. Extend/confirm reader contracts and server totals, then coordinate all money screens rather than just enabling an extra card.
9. Stage and approve backend changes in the Admin project; do not edit this project's auto-deploying function directory.

## 10. Required display changes and approval questions

### Recommended sequence — PROPOSED, not implemented

1. Resolve policy questions and obtain your approval for the exact scope.
2. Admin corrects collection/readiness/read-only contracts, booking gates, provider routing and scheduler authorization while real transfers remain paused.
3. Prepare worker changes: optional bank-first signup, consistent hidden UPI controls, non-destructive updates, accurate Home reminders and separate earning/transaction views.
4. Verify supplied contracts and isolated fixtures, bank-save readback, privacy/ownership and all boundary scenarios.
5. Obtain separate permission for provider sandbox testing and any controlled real-money pilot. Release/build/publish and enable automatic execution only under explicit authorization.

### Questions requiring your clarification

1. ~~Does the first-ten allowance apply only to workers joining after the switch, or also to existing workers?~~ **ANSWERED (owner, 2026-11-26): Existing workers too.** This matches the current server classifier, which has no new-worker-only restriction — no cohort change needed.
2. Should it count the first ten chronological completed services, allocated eligible earnings, or successful payouts? Current logic counts allocations after payout-record creation.
3. If bank details arrive after a worker has completed several jobs, should owed first-ten earnings be sent individually or as one approved backlog payout?
4. Should bookings completed at/after 7 PM be paid next day, as the current strict cutoff indicates? Is 7 PM the preparation/start time or a promised time of bank credit? Credit time cannot be guaranteed solely by a cron schedule.
5. Should unpaid legacy/failed/processing records stay in their current process, or migrate under an explicitly reconciled backlog plan? No automatic historical transfer should occur.
6. Is the current Home reminder card the “popup” to retain, or do you mean another existing screen? Bank/OFF/active-booking behavior should be confirmed without adding a blocking dialog.
7. When UPI collection is off, should saved UPI be hidden entirely or shown read-only for historical records? Historical UPI transactions should still remain accurately labelled.

## Verification and limits

**TESTED:** Five existing test files, **39 tests passed**, using `bun run test` for payout display, hybrid adapter/UI, profile column safety and mobile breakpoint/listener behavior. These are mocked unit/component tests, not provider or bank tests. React test output included pre-existing `act(...)` warnings in the hybrid test path; no test failed. The full application suite and Android builds were not rerun for this read-only audit.

**Reported mobile-hook error:** `src/hooks/use-mobile.tsx` has explicit named React imports and does not contain the quoted phrase “Please process and analyze the attached files/images.” Its existing test passed; latest inspected preview build log says `build OK` (26 Nov 07:30:26 UTC). The submitted UMD-global diagnostic was not reproduced. No unrelated hook modification was made and no manual build/typecheck was run.

**NOT VERIFIED:** Signed-in worker registration/bank save/booking acceptance/completion; installed Android UI/notifications; current hosted edge source parity; Cashfree account verification/IMPS execution; webhook delivery; successful daily preparation or consolidated bank settlement. Missing signed-in/provider/device evidence and your explicit audit-only restriction prevent certifying those flows. Source and read-only database evidence are not substitutes.

**Conclusion:** Preserve all legacy data and functionality. The most immediate blockers are the failed daily job, provider routing mismatch, UPI-required collection, live payout-dependent acceptance and legacy-only worker money displays. This audit is complete within the stated read-only scope; implementation, activation and payment testing await your approval.