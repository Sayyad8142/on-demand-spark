# Late Start OTP priority — preparation, not activation

## SOURCE / read-only hosted inspection
- `use-mobile.tsx` already uses named React imports. The reported UMD diagnostic was not reproduced; no hook edit justified.
- Hosted `start_otp_config` has enabled, retry, TTL settings, **no Late Start penalty setting**. No Late Start/penalty setting or reader RPC was found in hosted catalog/ops_settings.
- Hosted `recalc_worker_priority_score_one` counts all worker_fault_events at 20 points per fault; it has no distinct Late Start term. **Do not insert Late Start into worker_fault_events**: that would deduct the wrong amount.
- Workers cannot read arbitrary ops_settings or worker_fault_events under existing RLS. No privileges widened and no migrations/functions/production settings changed.

## Prepared app display
- Shared read-only `useWorkerPriority` retrieves paired stored priority_score/score_reason for Home, Profile and the Ranking personal card/list; real zero and decimal scores stay exact. Realtime invalidates then re-reads; 15-second foreground fallback, native resume, browser return, reconnect and completion refresh. No event score trusted, no local score arithmetic.
- English/Hindi/Telugu warning uses the server Admin amount; overdue countdown alone never claims a deduction. A booking-specific confirmed penalty uses its historical applied amount even if Admin later changes/disables the setting.
- Breakdown supports a distinct server-provided eighth part `late`, without re-labelling legacy aggregate faults. Stored score and reported final must agree; no inferred penalty or duplicate line.
- Late Start reader stays **OFF** (`LATE_START_PRIORITY_ENABLED=false`) because the contract below does not exist. No missing-RPC traffic or fictional 5-point defaults. Countdown, dispatch, allocation, availability, OTP actions and Android 10/15/20-minute alarm files unchanged.

## PROPOSED Admin/backend handoff (not deployed)
Provide a **read-only** authenticated `get_my_late_start_priority(p_booking_id uuid)` contract:

```json
{
  "contract_version": 1,
  "settings": { "enabled": true, "points": 5 },
  "penalty": { "booking_id": "requested booking UUID", "points": 5, "confirmed_at": "ISO timestamp" }
}
```

Return `penalty:null` until an actual server-confirmed deduction exists. Settings must come from Admin, not the app. Derive worker identity from Supabase auth and verify booking ownership server-side; accept no worker ID. Expose only the permitted setting fields and own receipt, not all Admin settings/events.

The Admin-owned server penalty writer must be independent of dispatch and OTP verification; one ledger receipt per booking/type with transaction-safe uniqueness/idempotency. Use the existing server acceptance/assignment +10-minute deadline; never restart on app open or trust device time to apply points. Disabled means no new penalty. Historical receipt stores applied amount; score recomputation includes it once, using an explicitly agreed window/cap, separate from 20-point faults. Publish paired score/reason atomically.

Extended score_reason: `pts(c/o/r/rec/b/reach/pen/late)=15/0/25/5/10/13/2/5 final=61`. `pen` must **exclude** `late`; values are explicit server contributions, final is stored server score. No app deduction or recomputation.

Before enabling: approve Admin setting UI and penalty window/cap, verify hosted security and concurrency tests, test a real authorized worker booking through countdown → server receipt → Home/Profile/Ranking readback, then enable only the reader. No deployment or publication implied by this report.

## NOT VERIFIED / remaining blockers
- Hosted penalty enforcement, Admin settings save and authenticated end-to-end receipt/score readback: blocked by missing Admin-owned contract/enforcement and external unmanaged session.
- Android physical-phone timing/audio: no phone/current APK; do not infer device evidence from source or app tests. Existing alarm system intentionally unchanged.
- Automated and browser evidence follows, separately from source review.

## VERIFIED automated/browser evidence (24 Nov)
- `bun run test`: **827 tests / 76 files passed** (16 new Late Start/score-refresh tests). Focused penalty/breakdown/countdown checks: 38 passed. Tests cover Admin amount 5 and changed 7, disabled setting, deadline without confirmation, repeated confirmation/events without further deduction, historical applied amount, malformed/wrong-booking rejection, separate minus-5 score part, score/reason pairing, real zero, native resume, account switch and listener cleanup.
- Fresh preview compiler result: build OK; no reported React UMD error. Intermediate new-code errors were repaired and the full suite passed afterward.
- Playwright isolated **actual countdown component**, at 320/393/1280 widths in en/hi/te: warning present → deadline with no receipt hides penalty → confirmed receipt shows deduction; Start button callback remains reachable; no horizontal overflow/page errors. Screenshots inspected for English warning and narrow Telugu confirmation. This fixture supplies synthetic receipts and does **not** prove hosted penalty application or OTP verification.
- Actual `/home` redirected to `/auth`, no page errors/error overlay. Authenticated central flow remains NOT VERIFIED, not tested in guest mode as a substitute.
- Temporary preview files removed; no Android files, edge functions, migrations, availability or dispatch code changed; nothing published.