# Service-specific training carousel

## SOURCE
- Presentation-only selection uses existing `service_type`, `maid_tasks`, and explicit boolean `has_glass_partition`. These fields already belong to the safe worker booking column list; no new database reads or mutations.
- Dishwashing: five existing approved images, unchanged. The last approved dishwashing image is the kitchen finishing step, not an added general floor-cleaning sequence.
- Floor cleaning: five new generated images (before, sweeping, accessible corners/under furniture, mopping, final).
- Combined: the five dishwashing steps followed by the five floor steps, stable ordering and no duplicate task sequence.
- Bathroom: six new generated images. Explicit glass add-on adds one glass-cleaning image before the final clean-bathroom photo, seven in total.
- Unknown, missing, unsupported or contradictory selections fall back to an existing service image. Image load errors use each slide's own existing service fallback.
- All photos are local, optimized 960 × 720 WebP. New photos are AI-generated illustrations, not photographs of actual workers. Each new sequence uses the initial image as a visual reference. Existing approved dishwashing images were not regenerated.
- Shared 4:3 carousel retains the existing dimensions, 3-second sliding, visibility/background pause, swipes, loop, preloading and dynamic dots; the booking/sequence key resets the position. Original server-provided task prices remain badges; no price calculation added.
- Floor/bathroom image descriptions use English/Hindi/Telugu display resources. No stored fields or service IDs are translated.
- No changes to pricing, earnings, durations, acceptance, dispatch, notifications, priority, OTP, countdowns or alarms. No backend function, version, signing, APK/AAB or production publishing changes.

## AUTOMATED
- Full app regression run: **910 tests passed, 82 files**, including seven concrete task-selection tests and six existing dishwashing tests.
- The seven new tests verify the five requested combinations, deterministic duplicate-free ordering, unknown/contradictory fallback and strict boolean glass gating.
- Current preview logs show build OK; reported use-mobile UMD diagnostic was not reproduced and the hook was not modified.

## BROWSER PREVIEW (synthetic inputs, not production booking evidence)
- Actual shared carousel and selection module rendered through the running preview with five synthetic booking selections at 393px width; desktop preview at 1280px.
- All expected images loaded with nonzero natural width. Verified five/five/ten/six/seven steps, three-second advancement, swipe events, already-loaded images while offline, and changing booking resetting to first slide.
- Inspected screenshots for every combination and desktop: whole 4:3 photos, compact layout and non-overlapping dots.
- Opening the actual Home route produced no page errors. This does not prove a signed-in active-booking flow.
- Browser fixture scripts and intermediate screenshots stayed under `/tmp/browser/service-training/`; no public test page added to the app.

## NOT VERIFIED / RELEASE BLOCKERS
- A real signed-in booking flow: external/unmanaged worker session unavailable; no worker/customer credentials requested or production booking created.
- Android cold-start/offline bundled playback, physical-device swiping and phone-state checks: no physical device session.
- Current Android web bundle was not rebuilt/synced in this UI task. A separately authorized release workflow must sync these latest assets before packaging.
- Nothing published; owner approval still required before release.