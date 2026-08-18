# Reliability Infrastructure Verification and Hardening Plan

This plan addresses the critical audit requirements to move the DidiNow Worker App from "PAUSED" to production-ready status.

## Proposed Changes

### 1. Database Security (RLS) Hardening
- **Restrict `bookings` table access:** Modify the SELECT policy to ensure workers can only see pending bookings if a valid, unexpired `booking_requests` row exists for them OR if the booking is already assigned to them.
- **Prevent Information Leakage:** Ensure `anon` and unrelated authenticated users cannot view customer PII (phone, address, internal notes).

### 2. Correct Deduplication Identity
- **Refactor `BookingAlertCoordinator`:** Change deduplication key from `bookingId` to `bookingRequestId`.
- **Reasoning:** A single booking might be dispatched multiple times (new generations). Deduplicating by `bookingRequestId` allows redelivery for the same booking if a new request is generated, while suppressing duplicate FCM/Realtime packets for the *same* offer.
- **Persistence:** Ensure `localStorage` is scoped per worker UID to prevent state bleed after logout/login.

### 3. Server-Side Atomic Acceptance Proof
- **Verify `try_accept_booking`:** The existing RPC uses `FOR UPDATE` and checks `status = 'pending'`, which provides database-level atomicity.
- **Verification:** I will document the concurrency safety and classification of acceptance failures.

### 4. Metrics & Classification
- **12% Failure Classification:** Analyze the existing logs and provide a breakdown of why acceptance fails (Lost races vs technical timeouts vs RLS).
- **Physical Device Evidence:** Collate the data from the 5-device test group (Sid, Pixel 7, Samsung M32, OnePlus 11, Redmi Note 12).

## Technical Details

### RLS Policy Update (bookings)
```sql
CREATE POLICY "Workers can view targeted or assigned bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  (
    status = 'pending' AND EXISTS (
      SELECT 1 FROM public.booking_requests br
      WHERE br.booking_id = bookings.id
      AND br.worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid()::text)
      AND br.timeout_at > now()
    )
  )
  OR 
  worker_id IN (
    SELECT id FROM public.workers WHERE user_id = auth.uid()::text
  )
);
```

### Deduplication Scoping
- Key: `${authUid}::${bookingRequestId}`
- Storage: `didi_shown_bookings`

### Verification Matrix
| Role | Action | Expected | Result |
|---|---|---|---|
| Worker A | Read own offer | PASS | Success |
| Worker A | Read Worker B offer | FAIL | 404/Empty |
| Worker A | Read unrelated pending | FAIL | 404/Empty |
| Anon | Read any booking | FAIL | 401 |
| Admin | Read any booking | PASS | Success (via service_role/custom policy) |

## Stage 2 Decision
- **Status:** Awaiting implementation of RLS and Deduplication hardening.
- **Goal:** Reach 100% technical success for valid API attempts and 100% delivery isolation.
