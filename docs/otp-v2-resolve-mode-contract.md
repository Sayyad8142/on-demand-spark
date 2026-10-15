# OTP V2 — `resolve_mode` gateway action (proposed contract)

Status: PROPOSED. Not in the agreed backend contract, not implemented, not deployed.
The Worker App source already speaks exactly this shape (`src/lib/otpV2.ts → resolveOtpMode`),
behind the OTP V2 client switch (off by default).

## Request

```
POST {SUPABASE_URL}/functions/v1/otp-v2-gateway
Content-Type: application/json
apikey: <anon key>
Authorization: Bearer <worker's Supabase access token>

{ "action": "resolve_mode", "booking_id": "<uuid>" }
```

No OTP, no worker id. The worker is resolved server-side from the verified token
(`workers.id = auth.uid()` OR `workers.user_id = auth.uid()::text`).

## Success — HTTP 200

```json
{
  "success": true,
  "booking_id": "<same uuid as requested>",
  "otp_mode": "legacy" | "v2",
  "assignment_generation": 3,
  "start_verified": false
}
```

- `otp_mode` is read from the authoritative per-booking OTP record written at V2 issuance
  (or the absence of one for pre-V2 bookings) — never inferred from status or creation date.
- `assignment_generation` is the V2 assignment counter (integer) or `null` for legacy bookings.
- `start_verified` is only informative; the client never uses it to authorize anything.
- Never returns OTP values, hashes, attempt counts, customer phone, or any customer secret.
- Read-only and safe to repeat.

## Errors — `{ "success": false, "code": "<CODE>", "message": "..." }`

| HTTP | code | When |
|---|---|---|
| 400 | INVALID_REQUEST | missing / non-uuid booking_id |
| 401 | UNAUTHORIZED | missing, invalid or expired token; no worker profile |
| 404 | BOOKING_NOT_FOUND | booking does not exist |
| 403 | NOT_CURRENT_ASSIGNMENT | booking unassigned, or assigned to a different worker (stale after reassignment) |
| 409 | TERMINAL_BOOKING | booking completed or cancelled |
| 503 | OTP_V2_UNAVAILABLE | mode record unreadable / V2 subsystem down — client shows "unavailable", never guesses |

Order of checks: auth → input → booking exists → terminal → current assignment → mode.
The client accepts only HTTP 200 with `success: true`, matching `booking_id`, a valid `otp_mode`
and an integer-or-null `assignment_generation`; everything else renders the safe "unavailable" state.

## Reassignment

Authorization is evaluated on every call against `bookings.worker_id` at that moment, so a
reassigned worker is refused immediately. Client display caches are memory-only, 2 minutes,
and cleared on NOT_CURRENT_ASSIGNMENT / TERMINAL_BOOKING / BOOKING_NOT_FOUND.
