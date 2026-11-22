# Accurate ranking / live dispatch preparation — 22 November

## Implemented, not activated
- Top Workers explicitly labelled “Top Workers — Performance Ranking”; existing server ranking and performance levels retained, exact scores preserved. Foreground 15-second refresh, reconnect/resume refresh, no overlapping fetches.
- Separate Next Booking view prepared behind the existing OFF gate on `/leaderboard`; no restored tab or preview/native auto-activation. Does not use performance scores to calculate positions.
- `liveDispatchView.ts` reads a proposed v1 `dispatch_view` extension on each existing `worker-next-booking` area. Known display fields only, no client ordering/eligibility/group calculations. Legacy responses produce “Position updating”, not a falsely verified next group.
- Shows recorded Offer Sent separately from phone receipt; only `phone_received_at` is receipt evidence. Future server-supplied groups use configured sizes and are explicitly estimates. Own position: Next Batch / In Line / Not Eligible / Position updating. Contradictory exclusions suppress the queue, stale/expired evidence stops claiming current positions.
- Existing secure-session refresh hook retained. When approved/enabled, refresh on own availability, own request/status changes, booking acceptance, offer resync/expiry, foreground, reconnect, slot boundary and 15-second backup. Subscriptions remain session/RLS scoped and removed on leave.

## Proposed endpoint extension — NOT a hosted contract
The endpoint must be adapted by its owner only after approval, using the exact production dispatch shared eligibility/order selector in a read-only snapshot. Do not recreate its logic in a separate endpoint or change dispatcher/settings/timestamps/assignments. Existing installed endpoint does not establish the extended contract, permitted names or exact production-source parity; no backend files were changed/deployed here.

```json
{
  "dispatch_view": {
    "contract_version": 1,
    "production_rules_verified": true,
    "rule_revision": "approved-production-selector-revision",
    "own_status": "next_batch",
    "own_group": 1,
    "batches": [
      {"group_number": 1, "configured_size": 5,
       "workers": [{"display_name": "permitted name", "is_me": true}]}
    ],
    "offers": [
      {"display_name": "permitted name", "is_me": false,
       "sent_at": "ISO timestamp", "expires_at": "ISO timestamp",
       "phone_received_at": null}
    ]
  }
}
```

`production_rules_verified` alone is not proof: verify hosted source/hash and actual shared selector before enabling this reader. Names must already be authorized for the requesting worker; never widen RLS/grants or use elevated browser credentials to obtain them. If not permitted, omit named members and return only the authorized own position. No phone/customer/address/token fields. Status `offer_sent` requires an own active recorded offer; ineligible/updating must not include own queue placement. Current rows only; settled offers/bookings remain unchanged.

## Tests / limits
Sid 22 Nov 10:10 replay tests compare archived Admin comparator with recorded five/three waves, not new production execution. Proposed projection fixtures retain those five sent names and Sid/Kaveri/Kavitha next group of configured five with three remaining members. Tests cover configured sizes, zero private-field copying, exclusions, legacy fallback, expiration and receipt distinctions. This is not proof of current live eligibility or hosted response parity.

Hook source imports React hooks explicitly; the quoted prose-as-UMD error is not present in `use-mobile.tsx`. No fake import/global fix made. Preview build logs are checked after edits.

Verification: full suite **787 tests / 72 files passed**, newest preview build **OK** (a new unknown-field type error in the proposed reader was corrected and compilation rechecked). Browser fixture checks: prepared queue at 393×805 and 1280×1800 in en/hi/te; names/server order/configured size, unknown -> Position updating with no Sid placement, unavailable -> Not Eligible with no queue; no overflow/page errors. English/Telugu phone screenshots inspected. Actual performance component with intercepted fixture: exact 40.5, requested heading, reconnect fetch and earnings navigation checked at 393×805; no Next Booking tab. These are isolated fixtures, not authenticated production/Android proof.

## Blocked on external source / approval
1. Exact hosted dispatcher and worker-next-booking source + approved privacy-safe extended contract; existing Admin snapshot not sufficient for live parity.
2. Owner approval for endpoint adaptation, enabling UI, publishing/native release. No deploy/publish/activation in this task.
3. Authenticated hosted worker and Android checks unavailable for external unmanaged Supabase; fixture browser checks and source/unit evidence only.
4. Prior issues remain: leaderboard edge SOURCE fabricates 50 for zero/missing; notification SOURCE differs from uniform dispatcher; historical company token/exclusion evidence unavailable. No unauthorized backend correction or score mutation.

No dispatch algorithm, eligibility, worker scores, settings, assignment, OTP, notification transport, permissions, settled data or app version changes.