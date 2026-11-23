# Home YouTube Shorts player — preparation, not publication

## SOURCE
- The reported TS2686 text is not in `src/hooks/use-mobile.tsx`; the hook already imports `useEffect` and `useState` explicitly. No hook change was needed.
- The existing Admin settings schema and Worker read expose `enabled` and `youtube_video_id`, not an original URL or aspect ratio. A bare YouTube ID cannot distinguish Shorts from landscape videos.
- The read-only parser now accepts official HTTPS Shorts/watch/embed/short links in the existing video value, preserving the ID and selecting portrait only for an explicit `/shorts/` URL. Existing bare-ID settings remain landscape. No Admin schema, production setting or management code was changed.
- The player uses centered, width/viewport-height-constrained 9:16 framing for Shorts and unchanged 16:9 framing for normal videos, without CSS zoom/cropping. Official YouTube controls and fullscreen permission are enabled. The sound button no longer covers the lower playback controls.
- OFF/error/offer/active-booking/background hiding and iframe unmounting remain unchanged. Release version, bookings, availability, scores, ratings, login, dispatch and notifications were not changed.

## Verification
- Focused video rules: 18 tests passed, including official Shorts links, landscape links/IDs, unsafe hosts, fullscreen/control parameters and all existing booking visibility gates.
- Preview build: OK after the player changes.
- Full regression suite: 790 tests passed across 72 files.
- BROWSER FIXTURE: actual player mounted with parsed Shorts/normal-link settings at 320×740, 393×805, 412×915 and 1280×1800. Exact 9:16/16:9 frame geometry, horizontal fit/centering, sound-button dismissal and fullscreen permission passed; no page errors. Phone screenshots inspected. The iframe response was replaced with a placeholder, so these checks do not verify YouTube media playback or sound.

## NOT VERIFIED / remaining blockers
- Existing Admin-saved ID-only Shorts will **not** automatically become portrait. Admin must preserve the original Shorts URL or provide authoritative format metadata; any schema/other-project work requires separate approval. No unreliable thumbnail or duration heuristic is used.
- Real signed-in Home integration is unavailable with the unmanaged external session in this environment. Isolated player fixtures do not prove the live Admin contract.
- Physical Android playback, pause, sound/fullscreen, and the actual content's internal letterboxing need checking in a newly synced APK. YouTube controls and framing are subject to YouTube/embed restrictions; the app cannot remove black bars baked into a video.
- Nothing published, deployed, sent or uploaded.

## Follow-up flow sweep — 23 Nov

**User rule:** Home Shorts should be vertical (9:16), normal videos landscape (16:9), with booking safety and Admin management unchanged. The original request limits changes to the Home player.

| Place / flow | Evidence read or run this follow-up | Result |
| --- | --- | --- |
| Home placement | `src/pages/Home.tsx` lines 300–350 | SOURCE: only Home mounts the training slot; scores and payout actions are separate. |
| Portrait/landscape player, sound and fullscreen | Full `HomeTrainingVideo.tsx` read | SOURCE: explicit format determines geometry; official embed controls/fullscreen allowed. Actual playback remains NOT VERIFIED. |
| Video settings parsing and URLs | Full `trainingVideo.ts` read; 18 tests rerun | PASS for explicit Shorts links; bare IDs intentionally retain landscape, so existing Shorts are still blocked. |
| Admin refresh / network errors | Full `useHomeTrainingVideo.ts` read | SOURCE: five-minute reads and foreground/resume reads retain changed format; errors hide the video. No writes or automatic orientation guessing. |
| Background / app resume | Same hook and full slot read | SOURCE: browser visibility and Capacitor app state hide/unmount the iframe on background; device behavior NOT VERIFIED. |
| Offers, active bookings, guest mode, disabled/error settings | Full slot, `useBookingOfferVisible.ts`, visibility helper and test read/run | PASS for pure visibility tests; SOURCE for subscriptions and iframe unmount. Real offer-to-video interruption on a phone NOT VERIFIED. |
| Leaving Home / logout | `App.tsx` ProtectedRoute and full route list read | SOURCE: Home is route-scoped, not a persistent player; loss of session redirects away; no second player mounted in routing. Real authenticated navigation NOT VERIFIED. |
| Other screens / separately built players | Repository search of all `src`, native app source, scripts, local functions/migrations for YouTube, video/iframe elements and player helpers; App route inventory read | SEARCH: no other Worker video renderer or video background job found. YouTube references in permission instructions are not players. This is not an execution check of every screen. |
| Academy video records | Generated `academy_lessons` / `academy_settings` types read, consumer search | SOURCE/SEARCH: separate schema has YouTube URL/embed fields but no Worker consumer found. Not the Home source; left untouched. |
| Live Home settings table | Hosted `information_schema.columns` SELECT | HOSTED READ: only id/enabled/youtube_video_id/updated_at/updated_by; no source URL or format field. |
| Live Admin save function | Hosted `pg_get_functiondef(admin_set_worker_training_video)` SELECT | HOSTED READ: strictly accepts 11-character IDs and rejects URLs; original Shorts information cannot reach this prepared parser through the current management flow. Admin UI source NOT VERIFIED. No permission/function/schema edits. |
| Android WebView configuration | Full `capacitor.config.ts` read | SOURCE: same app ID; loads production `dist`; no separate native video player found by source search. |
| Android packaged assets / release path | Twelve bundled JS files scanned; full AAB/release/verifier scripts read; verifier run | FAIL: existing bundle lacks YouTube/settings/portrait markers and other current app markers; `dist/index.html` absent. Build + Capacitor sync required outside this restricted workspace. No generated assets hand-edited. |

No additional in-scope orientation violation was found beyond the known missing Admin format information and stale Android output. Both require work outside a Home-player-only change. No settled records, permission settings, examples, production configuration, booking or payment records were modified.

**Carried-forward limits:** the earlier full suite passed 790 tests and placeholder-frame browser layouts passed at 320/393/412/1280px; this follow-up reran the 18 video tests only. Neither establishes real YouTube playback. Signed-in Home, Admin end-to-end updates, real Android pause/sound/fullscreen/letterboxing and phone booking interruptions remain NOT VERIFIED. Nothing published or deployed.
## Update 2026-11-23 (later): ID-only Shorts detection
- SOURCE: `useYoutubeFormat` now checks YouTube's full-frame picture (`i.ytimg.com/vi/<id>/oar2.jpg`) for ID-only or normal links. Portrait picture (height > 1.2 × width) → 9:16; wide, failed or >3 s → 16:9. Explicit Shorts links skip the check.
- VERIFIED (browser): current Admin video `GlfAOlNvRoI` → 720×1280 (portrait); `dQw4w9WgXcQ` → 1920×1080 (landscape). The picture path is undocumented by YouTube; if it stops working the player falls back to 16:9.
- Flow sweep: the Home player is the only video in the Worker App (no other YouTube embeds or video elements in `src/`). Admin-change refresh, background/resume and booking-interruption paths reuse the same slot and re-check per video ID.
- NOT VERIFIED: signed-in Home render and Android phone playback.
