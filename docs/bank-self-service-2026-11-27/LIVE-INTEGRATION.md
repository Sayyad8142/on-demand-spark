# Live bank integration — 27 Nov 2026

## VERIFIED — deployed contract inspected read-only
- Public `get_my_bank_details()` and `submit_my_bank_details(p_account_holder_name, p_account_number, p_account_number_confirm, p_ifsc, p_bank_name)` exist, are executable by authenticated users and not anon. Worker identity is session-derived through the Admin private implementation.
- Read statuses: `not_submitted`, `pending`, `verified`, `verification_failed`; fields: `can_edit`, `failure_reason`, `account_holder_name`, `account_number_masked`, `ifsc`, `bank_name`, `restricts_work:false`.
- Submit returns `success:true`, `outcome:submitted|corrected|unchanged`, `bank`; validation returns `error`, sometimes `bank`. Identical pending details are idempotent; failed identical details return `same_details_as_failed`. Five changed submissions per rolling 24h are enforced by the server.
- Live `_bank_gate_on()` definition is `SELECT false`; no backend change was needed or made.

## SOURCE — connected app
- Bank Details, Profile card and Edit Profile status use the same account-keyed `get_my_bank_details` cache, refreshed on opening, focus, reconnect and native foreground. Submission installs returned status then re-reads. Returned error-bank state also updates the cache, including a newly locked account.
- Pending shows status and allows correction when Admin's `can_edit:true`; failed shows rejection reason and respects `can_edit`; verified is always masked/locked with Call manager. Unexpected or unreadable responses never open a form.
- The exact live submit parameters replace the earlier staged names; success requires the deployed `success` and known `outcome`. The temporary opens-soon message is removed. No Cashfree call, beneficiary retry, payout action, direct bank write, new API, database migration or permission change was added.
- Home bank reminder preserved as a read-only bank-status card. Bank checks removed from ON and offer coordinator; realtime/polling/unified alerts no longer depend on bank readiness. Worker-health and online display ignore bank readiness. Approval, slot, notification, expiry, claim, Start OTP and completion safeguards are unchanged.
- Scanning still fills editable form fields locally, never auto-submits or verifies, and never fills account confirmation. Existing bundled Android ML Kit source is unchanged in this request.

## VERIFIED — tests and isolated preview
- Full suite: 107 files, 1,092 tests passed. Contract tests cover exact names, status/edit permission, masked-only data, duplicates, all deployed errors and rate-limit handling. Offer test confirms bank readiness is not consulted. Existing approval/OTP tests remain passing.
- Playwright ran the actual Bank Details screen with a synthetic account and mocked RPC responses matching deployed definitions: real Tesseract extraction of a synthetic passbook, blank confirmation, no photo upload, exact submit payload, pending readback, manual correction, too-many-attempts, locked rejection, verified mask/Call manager, English/Hindi/Telugu and mobile/desktop. No page errors; preview build OK.
- Repeated `use-mobile` diagnostic not reproduced; hook already imports React hooks explicitly.

## NOT VERIFIED — remaining blockers
- Real existing/new worker session → live bank submit → live readback: project uses externally managed Supabase sessions; sandbox cannot mint a worker session. No real worker bank data was changed or viewed.
- Real Android camera/gallery/ML Kit behavior, rotation, cleanup and low-memory phone: requires local test build and physical device. The prior native source still needs that test; no release/version increase/publication occurred.
- No remaining backend contract mismatch found in read-only definitions, but live authenticated execution and Admin verification processing remain unverified.

For Android testing, first update the local project from the connected repository; run `npm install`, `npm run build`, then `npx cap sync android`. Read the [mobile development guide](https://docs.lovable.dev/tips-tricks/mobile-apps) before testing on a device.