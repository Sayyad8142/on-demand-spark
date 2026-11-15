# Pending backend correction — get-worker-leaderboard (NOT deployed; needs approval)
Saving `supabase/functions/get-worker-leaderboard/index.ts` auto-deploys, so it was not edited.
Change in the leaderboard map (around line 214-215):
```ts
rating: typeof w.rating === "number" && w.rating > 0 ? w.rating : null,
priority_score: typeof w.priority_score === "number" ? w.priority_score : null,
```
Why: `||` turns a real 0 score into 50 and a missing rating into 5.0.
Until then the app shows the worker's own score from their own row and shows "—" for anyone with no customer reviews.
Also prepare: an authorized community-ranking response for the Home card (currently shows an honest pointer to Worker Ranking).
