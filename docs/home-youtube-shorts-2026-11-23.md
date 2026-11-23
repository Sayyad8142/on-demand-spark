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