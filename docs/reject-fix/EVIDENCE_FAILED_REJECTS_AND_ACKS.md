# Evidence — failed rejects and ACKs (production, read-only, 19 Oct 2026)
Phone numbers, tokens and names beyond first-name labels are not included. Worker IDs are internal UUIDs.

## A. 10 failed reject requests (HTTP 400) — all booking 246301bc-a5d4-4933-aca5-491772e1834e
Source: edge_logs (path, status, device model) + postgres_logs (error text), matched by timestamp (<50 ms apart).
The error value is the NEXT waiting worker, not the rejecting one. Rejecting worker / offer id is INFERRED from
order_sequence (rejecter = the pending worker in the batch just before the error worker); edge logs do not contain the body.

| # | UTC time | Endpoint | Device | Postgres error | Inferred rejecter (seq) | Inferred offer id |
|---|---|---|---|---|---|---|
| 1 | 07:42:15.994 | reject_booking_request (old APK) | Android 15 V2521 | malformed array literal: "0704ab7e-…f82a…" (seq 5) | b8027097 B kalpana (4) | 78088189-0c34-40d7-bcae-8953b79c7137 |
| 2 | 07:42:19.120 | reject_booking_offer (new APK) | Android 16 SM-S911B | "d43dccb3-…" (seq 3) | 8e03deed Sid (2) | 9ad8837e-7318-4071-98dd-7e00b8c81e5f |
| 3 | 07:43:25.963 | reject_booking_request | V2521 | "0704ab7e-…" | B kalpana | 78088189-… |
| 4 | 07:43:28.207 | reject_booking_offer | SM-S911B | "d43dccb3-…" | Sid | 9ad8837e-… |
| 5 | 07:45:07.014 | reject_booking_request | V2521 | "0704ab7e-…" | B kalpana | 78088189-… |
| 6 | 07:45:11.064 | reject_booking_offer | SM-S911B | "d43dccb3-…" | Sid | 9ad8837e-… |
| 7 | 07:46:11.527 | reject_booking_offer | SM-S911B | "d43dccb3-…" | Sid | 9ad8837e-… |
| 8 | 07:46:14.460 | reject_booking_request | V2521 | "0704ab7e-…" | B kalpana | 78088189-… |
| 9 | 07:47:07.506 | reject_booking_request | Android 13 I2011 | "ea51dbc4-…" (seq 7) | 77d07401 Rajeswari bhukiya (6) | 0022a60a-72c0-440c-9700-eb25e0f97add |
| 10 | 07:49:41.665 | reject_booking_request | I2011 | "ea51dbc4-…" | Rajeswari bhukiya | 0022a60a-… |

Each worker retried ~every minute because the offer stayed pending and was re-sent. Final statuses of those
offers: unreachable (timeouts) — none ever became "rejected". Last successful reject anywhere: 05:04 UTC
(booking 844cf466, which then took a no-next-tier path).

## B. Failing line
`public._reject_booking_request_core(uuid, uuid)` (database function, no repo file — live definition in
`000_reject_core_LIVE_BACKUP.sql`), the statement inside `IF v_next_tier IS NOT NULL`:
`UPDATE booking_requests ... RETURNING worker_id INTO v_next_tier_workers;` (`v_next_tier_workers uuid[]`).
Postgres assigns the single uuid text to a uuid[] → "malformed array literal" → whole transaction rolled back.

## C. ACK failures
- 07:52 UTC read: 37 requests to `ack-booking-delivery` in the prior 24h, all HTTP 400.
- 07:59 UTC re-read: only 3 still retrievable (07:49:41–07:49:43, Android 13 I2011, 400, ~130 ms). Log retention
  for this source is short; the other 34 can no longer be shown. The 37 figure is from the earlier read only.
- Booking 246301bc: 7 offers have only push_sent + server_not_delivered/server_unreachable events; 0 device events.
- Cause (from the earlier push-ack audit): the DEPLOYED function is an older build accepting only received/opened;
  phones send push_received/popup_shown → 400. The deployed original is NOT in this package — the owner holds the
  dashboard backup. Included: current repo source + the staged corrected version (with worker_id validation).
