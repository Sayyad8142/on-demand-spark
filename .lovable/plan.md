# Phase 3 – AI Booking Assistant & Worker Coach

Builds on the existing Voice Assistant (Phases 1–2). No changes to dispatch, OTP, or payout logic. All new behavior is additive; if TTS/STT/network fails, the current UI keeps working unchanged.

## What ships

1. **Voice booking announcement** – when a new booking alert arrives (unified via `useUnifiedBookingAlerts` / `useBookingAlerts` pending state), assistant speaks a ≤10s summary: service, community, flat/BHK, est. earning, and "Would you like to accept?". If the assistant sheet is mid-conversation, pause current TTS, announce, then restore.
2. **Voice accept/reject with confirmation** – worker says "accept" / "reject" / "skip". Assistant always replies "You want to accept this booking. Please say Confirm." Only on explicit "confirm" it calls the existing `tryAccept` / `rejectBooking` in `src/lib/bookingActions.ts`. Never auto-fires.
3. **Active booking assistant** – once accepted, assistant gains booking context (from `useActiveJob`) and answers: navigate, call customer, OTP, earnings, service type, typical duration. Adds tools: `get_active_booking`, `open_navigation`, `call_customer`, `show_otp_screen`.
4. **Intelligent worker coach** – new tool `diagnose_no_bookings` that reads availability, priority score, rating, missed bookings, recent activity, community demand, accepted/completed counts and returns a personalized answer. Never generic.
5. **Morning briefing** – on first app open per day (localStorage `didi:lastBriefingDate`), auto-open assistant in "briefing" mode with yesterday's stats + today's high-demand hours. Toggle in Settings (`briefing_enabled`).
6. **Evening summary** – after last completed booking of the day, or when worker toggles offline in the evening, deliver spoken summary of today's bookings, earnings, ratings, priority delta. Same Settings toggle.
7. **Idle tips** – occasional short tip if worker online, idle >20 min, no active booking, no fullscreen modal. Rate-limited (max 1/2h). Toggle in Settings (`tips_enabled`).
8. **Voice navigation during jobs** – expanded `navigate_to_screen` routes: customer details, call, OTP screen, earnings, home.
9. **Safety guardrails** – suppression flag already exists; extend to also suppress announcements/tips during OTP verification, payment, emergency, cancellation. Never speak customer phone/address in tips or briefings.
10. **Performance** – announcements triggered directly from the realtime alert callback (no polling). All heavy state read via existing hooks; no new subscriptions. Assistant sheet stays lazy.

## Technical details

**Frontend**
- New `src/services/voice/BookingAnnouncer.ts` – queue of TTS utterances; pause/resume around active conversation.
- New `src/hooks/useVoiceBookingAnnouncements.ts` – subscribes to pending booking alerts; calls announcer; opens assistant in `mode: "booking_offer"` with booking payload; listens for "confirm"/"cancel" transcripts.
- New `src/hooks/useMorningBriefing.ts` – runs once/day on app boot after auth.
- New `src/hooks/useEveningSummary.ts` – triggers when worker goes offline after ≥1 completed booking today.
- New `src/hooks/useIdleTips.ts` – 20-min idle timer, guarded.
- Extend `VoiceAssistantContext` with `announceBooking(booking)`, `speak(text)`, `isSpeaking`, `suppress` (respects existing modals).
- Extend `VoiceAssistantSheet.tsx` to render a Booking Offer card (accept/reject buttons + "say Confirm" hint) when `mode === "booking_offer"`.
- Settings toggles in `src/pages/Settings.tsx` for briefing/summary/tips (persisted in `profiles` or `workers` settings JSON — reuse existing per-worker settings if present, else localStorage).

**Backend (`supabase/functions/voice-assistant/index.ts`)**
- Add modes: `"booking_offer"`, `"briefing"`, `"summary"`, `"coach"`, `"active_job"`.
- Add tools: `get_active_booking`, `diagnose_no_bookings`, `get_daily_summary` (yesterday + today aggregates), `propose_booking_action` (accept/reject/skip — returns pendingAction requiring "Confirm").
- Extend `PendingAction` union with `{ type: "accept_booking" | "reject_booking", bookingId }`. Client executes via existing `tryAccept` / `rejectBooking`.

**Safety**
- Announcer checks: no active fullscreen modal (OTA, battery, cancellation, OTP, payment), no in-flight OTP entry, no emergency pause.
- Coach/briefings never include customer phone or full address.

## Out of scope

- No changes to `booking-notifications`, dispatch, `tryAccept`, `rejectBooking` internals, OTP completion, or payouts.
- No new DB tables; briefing/tips preferences stored in existing `profiles`/localStorage.

## Rollout

1. Backend: extend `voice-assistant` with new modes/tools.
2. Client: announcer service + hooks + context extensions + sheet UI for booking offer + Settings toggles.
3. Verify with existing realtime alert (Home page) — announcement fires, confirm path calls `tryAccept`, cancel does nothing.
