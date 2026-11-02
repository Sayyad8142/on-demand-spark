# Home Screen Training Video — Phase 1 Audit (read-only)

Nothing built, deployed or published. Feature is not in the app.

## BLOCKER — no Admin Panel config exists (VERIFIED, main project paywwbuqycovjopryele)
Searched every public table/column for video/training/youtube. Only found:
- `academy_lessons.youtube_url / youtube_video_id` — Academy lesson videos (not a Home video).
- `academy_settings.youtube_embed` = `{autoplay:false, controls:true, related:false}` — player options only, no on/off, no video.
No Home training video on/off switch or published video exists. The brief forbids creating a duplicate config,
so the Admin Panel (separate project) must create it first, or the user must approve creating it here.

Proposed shape (PROPOSED, needs approval): one row in a new table `home_training_video`
(`enabled bool default false`, `youtube_video_id text`, `updated_at`), SELECT for signed-in users only,
writes admin-only via `has_role(auth.uid(),'admin')`; Worker App reads through a read-only RPC
`get_home_training_video()` that returns nothing unless enabled AND the ID is a valid 11-char YouTube ID.

## Files to change (PROPOSED)
- NEW `src/lib/trainingVideo.ts` — pure rules: valid ID, `shouldShowVideo({enabled, videoId, activeJob, offerVisible, guest, appForeground, route})`.
- NEW `src/hooks/useHomeTrainingVideo.ts` — read config (cached, refetch on resume + every 5 min); any error → hidden.
- NEW `src/components/HomeTrainingVideo.tsx` — official YouTube IFrame Player API, 16:9, rounded, margins.
- `src/pages/Home.tsx` — one line rendering it under `HomePerformanceCard`, inside the existing `!activeJob` condition.
- NEW tests `src/lib/__tests__/trainingVideo.test.ts`.
No changes to booking, availability, OTP, FCM, payments, navigation or cards.

## Layout
Toggle → Priority/Rating card → **video (16:9, rounded)** → Leaderboard → nav. Not rendered at all when hidden (no empty box).

## Visibility (all must be true)
Admin enabled + valid ID + not guest + no active job (`useActiveJob`) + no booking offer showing (`useBookingOfferVisible`)
+ app in foreground + on /home. Booking state comes only from existing hooks; closing a screen never counts as completion.

## Player lifecycle
Offer appears → pause immediately. Accept/active job → player removed (iframe destroyed, audio stops).
Background → pause. OFF / config error → removed. Same ID not reloaded. One player only. Load is deferred until after Home renders.

## Autoplay limits (YouTube/Android WebView)
Autoplay with sound is normally blocked without a tap. Plan: try muted autoplay once, show a "Tap for sound" chip; if
autoplay is blocked, normal Play button. No retries, no workarounds. Embeds disabled by the video owner show nothing (hidden).
Uses data — consider "Wi-Fi only" later (not in scope).

## Tests
Unit tests for scenarios 1–11, 13–14 via the pure rules + mocked config. Run full `bun run test`.
Scenarios 12, 15 and real autoplay need a phone test (NOT VERIFIED here). Phones only get it with a new APK (bundled screens).
