
# Didi Now Voice Assistant — Implementation Plan

The full PRD is ~6 months of work. To ship safely without breaking the live worker app (bookings, FCM, payouts, dispatch), we deliver in **3 phases**. Each phase is production-ready on its own. Phase 1 goes live in ~2 weeks; Phases 2 and 3 layer on without regressions.

Nothing in the existing booking/dispatch/FCM/payout paths is modified. The assistant only *reads* worker data and *proposes* changes that the worker confirms with a tap or a spoken "Confirm".

---

## Phase 1 — Foundation + Read-Only Q&A (ship first)

**Goal:** Floating assistant on every screen, voice-first, trilingual, answers real questions from the worker's own data. No writes yet.

### New UI

- `src/components/voice/VoiceAssistantFAB.tsx` — bottom-right floating button, `z-[120]`, `bottom: calc(5rem + env(safe-area-inset-bottom))`, idle pulse, auto-hides when a fullscreen modal is active.
- `src/components/voice/VoiceAssistantSheet.tsx` — bottom sheet that opens on tap: mic waveform, transcript, TTS playback, text-fallback input, Skip / Repeat / Ask Question buttons.
- `src/contexts/VoiceAssistantContext.tsx` — global open/close, `isFullscreenModalActive` flag, mic permission state, current language, current agent.
- Mount FAB in `AppInner` alongside existing overlays.

### Voice pipeline

- **STT:** Lovable AI `openai/gpt-4o-transcribe`. Push-to-talk only (no continuous listening). Web Audio → WAV upload → SSE stream of deltas.
- **TTS:** Lovable AI `openai/gpt-4o-mini-tts`, SSE PCM streaming for <2s first-audio latency.
- **LLM (Master Assistant):** Lovable AI `openai/gpt-5.5` (fast mode) via AI SDK `streamText` with tool calling.
- **Language detection:** LLM auto-detects Telugu/Hindi/English from transcript; TTS `instructions` field steers voice to same language. Low-confidence → trilingual re-prompt.

### Edge functions (new)

- `supabase/functions/voice-stt/` — proxies STT (keeps `LOVABLE_API_KEY` server-side).
- `supabase/functions/voice-tts/` — proxies TTS (SSE passthrough).
- `supabase/functions/voice-assistant/` — Master Assistant. Receives `{messages, workerId}`, streams `UIMessage` response, registers **read-only tools**:
  - `get_worker_profile` (workers)
  - `get_priority_score` (workers + score history)
  - `get_earnings_summary` (worker_payouts, buckets: today/week/month/pending/failed)
  - `get_bookings_summary` (bookings — recent/completed/cancelled counts)
  - `get_ratings_summary` (worker_ratings + latest 3 reviews)
  - `get_availability` (worker_availability)
  - `get_health_status` (fcm_tokens, notification_delivery_events, missed diagnostics)
  - `get_community_demand` (aggregated booking counts by slot for worker's community)
  - `navigate_to_screen` (client-side event → react-router navigate; safe, no data change)

### Database (new)

Single migration, schema-additive only, with GRANTs:

- `voice_conversations` (id, worker_id, started_at, ended_at, language, turn_count)
- `voice_messages` (id, conversation_id, role, content, tool_calls jsonb, created_at)
- `voice_events` (id, worker_id, event_type, payload jsonb, created_at) — analytics for coaching triggers

RLS: workers see only their own rows; edge functions use service role.

### i18n

- Add `voice.*` keys to `en/hi/te` (open/close/listening/thinking/tap-to-speak/mic-denied/etc.).
- No changes to any existing translation key.

### Native (Android)

- No new native plugin required for Phase 1 — Web Audio + `getUserMedia` works in the Capacitor WebView; mic permission already declared in AndroidManifest. If denied → text-input fallback in the sheet.

### Not touched in Phase 1

Auth.tsx, OtpVerify.tsx, Bookings.tsx, Home.tsx booking-alert path, FCM, dispatch, payouts, overlay service, heartbeats. Zero risk to production dispatch.

---

## Phase 2 — Voice Actions, Signup Assistant, Guided Tour

Layered on top of Phase 1. Every action requires explicit confirmation ("Confirm Accept" / tap Confirm).

### Voice Signup Assistant

- New `src/components/voice/SignupCoach.tsx` overlay on `Auth.tsx` (opt-in — worker taps "Fill with voice" button, doesn't hijack the existing form).
- Fills existing controlled inputs via a shared draft object (already exists as `didi-worker-auth-draft-v1`). Worker still submits normally.
- UPI step offers 3 branches: speak UPI, live camera scan (new `@zxing/library` in a `UpiLiveScan` component), or existing image upload. Post-process spoken UPI: "at" → `@`, spaces stripped, read-back confirmation.

### First-Time Guided Tour

- `src/components/voice/GuidedTour.tsx` — after signup, walks Home → Bookings → Availability → Profile → Priority → Ratings → Earnings → Settings. Each stop: navigate + short TTS + Skip/Next/Repeat/Ask.
- Progress stored on `workers.tour_completed_at` (new column).

### Write tools (added to voice-assistant edge fn, all `needsApproval: true`)

- `update_availability_slots(day, slots[])` → same RPC used by AvailabilityToggle
- `update_upi_id(upi)` → validates `upiSchema`, calls existing `updateWorker`
- `update_profile(name?, services?, communities?)` → existing RPC
- `set_online_status(online)` → same guard as AvailabilityToggle (payout_ready, pushHealthy, slots)
- `call_support()` → returns `tel:` link, worker taps
- `open_diagnostics()` → navigate

### Notification Coach for booking alerts

- Opt-in switch in Settings (`workers.voice_booking_readout_enabled`).
- When BookingAlert modal opens AND opt-in is true AND app is foreground: TTS reads "New Maid booking, Flat B-204, ₹120. Say Confirm Accept to accept."
- Uses existing `try_accept_booking` / `reject_booking_request` RPCs — no dispatch changes. Two-word confirmation required. Hard-disabled during CompleteBooking OTP screen.

---

## Phase 3 — Proactive Coaching, Motivation, Support Escalation

### Coaching engine

- New edge fn `worker-coaching-engine` — pg_cron every 15 min. Computes per-worker signals (score delta, missed bookings, low online hours, high-demand slot upcoming, milestone hit) → writes to `voice_coaching_nudges` table.
- Client polls / realtime subscribes → shows subtle bell on FAB → tap to hear.
- Never speaks unprompted (no auto-TTS). Worker must tap.

### Booking Coach / Priority Coach / Schedule Optimizer / Earnings Assistant

- Additional tools on Master Assistant that pull structured explanations from stored formulas already used by `PriorityScoreCard` and `Earnings`.
- Schedule Optimizer proposes a slot pattern → confirmation → writes via existing `update_availability_slots`.

### Milestones & Motivation

- Milestone detector in coaching engine (first booking, 10/50/100, 5⭐ streak).
- Adds nudge with celebratory copy and (optional) confetti in sheet.

### Support Agent

- On unresolved issue → attaches recent `notification_logs`, `worker_missed_booking_diagnostics`, `fcm_tokens` health → creates a `support_threads` row (existing table) → opens WhatsApp/tel deep-link.

---

## Safety Rules (enforced in every phase)

1. All mutating tools use AI SDK `needsApproval: true`; UI renders "Confirm" button with spoken read-back before the tool actually runs.
2. Booking Accept/Reject requires **two-word** confirmation ("Confirm Accept") plus 2-second grace window. Logged to `booking_events.meta.source = 'voice'`.
3. Never delete accounts, never change bank details silently, never reveal `cust_phone` beyond what's already on ActiveJobCard.
4. Push-to-talk only. Mic indicator visible while active. Auto-stop after 10 s silence.
5. Assistant auto-mutes on CompleteBooking, ForceUpdateScreen, WorkerBlocked, PermissionOnboarding, BatteryOnboarding, OtaMandatoryModal.
6. STT/TTS never called from client — always through edge functions with `LOVABLE_API_KEY` server-side.
7. Conversation history is per-worker, RLS-scoped, and truncated to last 20 turns before being sent to the LLM.

---

## Technical Architecture (Phase 1 deliverable)

```text
┌────────────────────────────────────────────────────────┐
│ VoiceAssistantFAB (all screens, z-120)                 │
│ VoiceAssistantSheet (mic + waveform + transcript)      │
└─────────────┬──────────────────────────────────────────┘
              │  useChat (AI SDK) with DefaultChatTransport
              ▼
   /functions/v1/voice-assistant  ──►  streamText
              │                          + tools (read-only)
              │                          + gpt-5.5 (fast)
              ├── /functions/v1/voice-stt (openai/gpt-4o-transcribe)
              └── /functions/v1/voice-tts (openai/gpt-4o-mini-tts SSE PCM)

Read-only tools query: workers, worker_payouts, worker_ratings,
  worker_availability, bookings, fcm_tokens, notification_delivery_events,
  worker_missed_booking_diagnostics, communities

New tables: voice_conversations, voice_messages, voice_events
```

Router (unchanged), AuthContext (unchanged), BottomNav (unchanged), booking-alert pipeline (unchanged).

---

## Deliverables per phase

| Phase | Ships | Regressions risk |
|---|---|---|
| 1 | FAB + sheet + STT/TTS + 9 read-only tools + trilingual Q&A + analytics tables | ~zero (additive only) |
| 2 | Signup coach + guided tour + 6 write tools + notification read-out (opt-in) | low (uses existing RPCs, opt-in switches) |
| 3 | Coaching engine + milestones + support escalation + schedule optimizer | low (background cron; UI is nudges) |

---

## Post-implementation docs (delivered at end of each phase)

Architecture diagram, screen flow, voice interaction flow, AI module docs, DB changes, API changes, security review, test checklist (STT accuracy per language, mic-denied fallback, confirmation gates, offline behaviour), rollout plan (feature flag `app_config.voice_assistant_enabled` — off by default → 10% workers → 100%), and future enhancements (on-device Whisper, continuous coaching, video tutorials).

---

## What I need before starting Phase 1 build

1. **Approve this phased plan** (yes / adjust scope).
2. Confirm we can use **Lovable AI Gateway** for STT/TTS/LLM (default). If you'd rather use ElevenLabs voice (more human-sounding TTS + realtime STT), say so and I'll swap the pipeline — everything else stays the same.
3. Confirm the **feature flag rollout** approach (`app_config.voice_assistant_enabled`, phased %).

On approval I'll immediately begin Phase 1: migration, 3 edge functions, VoiceAssistantContext + FAB + Sheet, i18n keys, and wire it into `AppInner`. Estimated ~15 files, no changes to existing booking/dispatch/payout code.
