
# OTP Completion Reminder Escalation

Mandatory full-screen reminder to workers when an accepted booking has no OTP entered after 60 minutes, repeating every 10 minutes until OTP is verified.

## Trigger Conditions

Active booking for the current worker where ALL apply:
- `status IN ('accepted','confirmed','on_the_way','started','in_progress')`
- `otp_verified = false`
- `accepted_at <= now() - 60 minutes`

Stop immediately when `otp_verified = true` or status becomes cancelled/completed.

## Implementation

### 1. New hook: `src/hooks/useOtpReminderEscalation.ts`
- Runs while the worker is signed in.
- Every 30s polls (or reuses existing active-booking subscription) for the worker's eligible bookings.
- Maintains per-booking state in `localStorage` (`otp_reminder:{bookingId}`):
  - `firstTriggeredAt`, `lastShownAt`, `acknowledgedCount`.
- Fires the alert when:
  - first time after 60min elapsed, or
  - 10min elapsed since `lastShownAt` and OTP still not entered.
- On fire: opens the alert UI, plays voice 3x, vibrates, logs audit event.

### 2. New voice helper: `src/lib/otpReminderVoice.ts`
- Mirrors `cancellationVoice.ts` pattern.
- `playOtpReminderVoice()`: uses Web Speech API (`speechSynthesis`) to say "OTP pending. Please enter customer OTP." 3 times, then stops.
- `stopOtpReminderVoice()`: cancels speech.

### 3. New full-screen alert UI in `src/App.tsx`
- Mirrors the existing booking-cancelled modal (calm amber, big OK button, no shake).
- Title: ⚠ OTP Pending
- Message: "This booking was accepted more than 60 minutes ago and the customer OTP has not been entered. Please collect the OTP from the customer and complete the booking."
- Buttons:
  - **Enter OTP Now** (primary) → navigates to `/complete-booking/:id` with `?focusOtp=1`, stops voice, logs `otp_reminder_acknowledged` + sets `acknowledged_via='enter_otp'`.
  - **OK** (secondary) → closes modal, stops voice, logs `otp_reminder_acknowledged`.
- Vibration: `navigator.vibrate([500,200,500,200,500])`.

### 4. CompleteBooking focus
- `src/pages/CompleteBooking.tsx`: when `?focusOtp=1` is present, scroll to and focus the OTP input on mount.

### 5. Audit table + RPC
Migration creating `public.otp_reminder_events`:
```
id uuid pk, booking_id uuid, worker_id uuid,
event_type text check in ('otp_reminder_triggered','otp_reminder_acknowledged','otp_reminder_repeated','otp_entered_after_reminder'),
metadata jsonb, created_at timestamptz default now()
```
With GRANTs, RLS (worker can insert their own events; admins can read all), and `service_role` full access.

Hook calls a small `log_otp_reminder_event` RPC (security definer) to insert rows safely.

### 6. Wire into App
Add `useOtpReminderEscalation()` to `App.tsx` alongside the existing booking-cancellation handling, with state controlling the new modal.

## Out of Scope
- Native overlay (web/in-app modal only; same surface used for current cancel popup).
- Push/FCM-triggered escalation when app is killed (future).

Continue?
