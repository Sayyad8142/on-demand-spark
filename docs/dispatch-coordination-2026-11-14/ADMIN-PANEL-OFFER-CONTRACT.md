# Admin Panel handoff — final offer contract before Worker App release

**PROPOSED coordination checklist, not a deployed server change or Admin Panel acceptance.** Prompt 99 approves Worker App preview preparation only.

## Confirm together

1. An offer starts as `pending` and is addressed to exactly one session-linked worker. Accept/Reject server logic derives identity from a verified login; no phone/id fallback.
2. Every delivery path preserves the same booking ID, request ID and absolute `timeout_at`. If the same request row is reoffered, the server publishes a genuinely new deadline and pending UPDATE; it must not refresh an expired generation merely because the app resumed. Prefer an explicit immutable generation ID for a future coordinated contract revision.
3. The server deadline is authoritative across FCM, realtime, poll/heartbeat and acceptance RPC; native/client timers may cap but never extend it. Confirm one deadline policy instead of conflicting 30/45/60/90-second lifecycles.
4. Accept atomically verifies the logged-in worker's own pending, unexpired offer and unassigned booking. Return stable terminal errors: `offer-expired`, `already-assigned`, `not-offered`, `offer-closed`, `request-not-found`, or existing `P0001 BOOKING_ACCEPTANCE_CLOSED:`. Unknown/network failures remain retryable only within the original deadline.
5. Confirmed rejection RPC owns escalation exactly once. Worker App no longer invokes `notify-next-tier`; list and reconcile all hosted cron/trigger/watchdog dispatch owners separately before changing them.
6. Close events distinguish request expiration/rejection (generation scoped) from booking assigned/lost (booking scoped). Late old-generation events must not close later offers. Confirm any `lost` event means permanent assignment, not a temporary request close.
7. Confirm exact worker lookup and own-request read permissions for the native verified-session preflight, including duplicate-link/duplicate-request refusal and safe read failure. No extra worker/customer/OTP fields are needed.
8. Audit ACK-token issuance and verified-session fallback against hosted receiver code; visible-only ACK remains separate from acceptance authority.

## Evidence needed before release

- Hosted source/configuration backups and parity checks for every dispatcher, accept/reject RPC, stale-offer recovery and receiver involved; repository copies are not hosted proof.
- Admin Panel owner confirms the agreed fields, statuses, deadline, generation closure semantics and errors above.
- Approved isolated signed-in worker + physical Android tests from `PROMPT-99-RESULTS.md`, including same-row pending UPDATE and delayed closure.
- Separate owner approval for any backend changes, test notifications and final signed APK/AAB release. Keep live ranking integration OFF.

Until these gates pass: **NO-GO for unified dispatch production switch-over or Worker App release**.