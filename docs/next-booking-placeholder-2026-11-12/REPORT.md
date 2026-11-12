# Next Booking placeholder — preview-only results

## Result
- Top Rated replaced on the ranking page by Next Booking, with the requested Coming Soon copy.
- Existing Top Workers and Top Earners ordering, data reads and personal card metrics preserved. On Next Booking, the personal card uses the existing Top Workers order; the panel contains no worker list or queue position.
- Shared review sorting and review data retained. No worker-next-booking call added.
- Unsupported booking-order claims replaced with neutral leaderboard/score wording on the ranking page, Home leaderboard, profile score badge, and ratings support answer. Scores, ratings, assignment and dispatch unchanged.

## Exact modified files
1. `src/components/BookingLeaderboard.tsx`
2. `src/components/WorkerLeaderboardCard.tsx`
3. `src/components/profile/PriorityScoreCard.tsx`
4. `src/pages/ContactSupport.tsx`
5. `src/lib/leaderboardRanking.ts`
6. `src/lib/__tests__/leaderboardRanking.test.ts`
7. `src/i18n/locales/en.json`
8. `src/i18n/locales/hi.json`
9. `src/i18n/locales/te.json`
10. `roadmap.md`

Additional files: this report, original-file backups under `backup/`, and `backup/sha256.json`. Eleven backup hashes verified; root AGENTS.md unchanged because its protected size budget prevented adding a rule.

## Verification
- VERIFIED: 53 test files / 572 tests passed; zero failed.
- VERIFIED: preview's automatic build reported build OK after the final source edit. No manual build executed.
- VERIFIED WITH ISOLATED FIXTURES: English, Hindi and Telugu placeholder, selection, and preserved Top Workers/Top Earners ordering at 393×805 and 1280×1800. No horizontal page overflow or browser page errors in these checks.
- NOT VERIFIED: signed-in end-to-end `/leaderboard` flow; this project has external unmanaged authentication. Isolated rendering is not evidence of authenticated backend correctness.
- SOURCE: mobile hook uses named React imports; it was not modified. Latest preview build contains no reported UMD error.

## Safety
No database changes, Edge Function changes/deployments, APK builds/publications, notification sends, or live Next Booking activation. Preview source only; nothing published. The unverified endpoint remains disconnected.