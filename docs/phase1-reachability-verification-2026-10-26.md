# Phase 1 reachability verification — 2026-10-26 (read-only)

Nothing changed, deployed or sent.

## 1. Automatic OFF (watchdog)
- VERIFIED: cron `worker-health-watchdog` runs every 2 min (edge function).
- VERIFIED: `worker_status_history` last 7 days = only `manual_toggle`, `admin_manual_online`, job/busy entries. **Zero automatic OFF events.**
- VERIFIED: last `auto_paused_at` = 2026-10-11. 5 workers still carry `availability_last_source=system_auto_offline` from earlier (4 are ON).
- Conclusion: the 5-minute auto-OFF seen in repo source is **not active in production now**. Deployed watchdog code ≠ repo copy (NOT VERIFIED which version). No fix needed now; repo file should be replaced with deployed copy before anyone redeploys it, or it would bring the auto-OFF back.

## 2. Overlay filter
- Deployed sender code NOT obtained (no dashboard access).
- VERIFIED: no ON worker with a token has `overlay_permission_granted=false` (all 19 are null). So even if the filter is live, it excludes **nobody today**. Risk only for future workers who decline the popup.

## 3. Four ON workers without tokens
- VERIFIED: all `fcm_token_status=missing`, notification permission granted, valid login ID.
- App versions: 7.0.0 (2), 6.0.64 (1), 10.0.02 (1). Last app open: Sep 5, Sep 23, Oct 3, Oct 11. Last heartbeat Oct 20–23.
- No token-deletion/repair events since Aug. Most likely: token cleared after FCM reported it invalid (app reinstalled/data cleared/force-stopped), and the phone hasn't re-registered because the worker hasn't opened the app. NOT VERIFIED per worker.
- Existing app recovery (token sync on launch/login/refresh, boot sync worker) already covers this once she opens the app. Cannot recover silently from force-stop.
- Action: ask these 4 workers to open the app (Admin call), no code change.

## 4. Fairness / 4.5-star tier
- VERIFIED last 7 days: tier-2 ON workers (14) got 747 offers vs tier-1 (5) 102. The tier does not block lower-rated workers in practice.

## 5. Isolated tests
NOT RUN — no isolated database provided.

## Recommendation
NO-GO for code changes now: none of the three suspected problems is actively harming workers in production. GO for: (a) obtaining deployed watchdog + sender code to replace stale repo copies; (b) Admin contacting the 4 workers; (c) an isolated test database for the simulation.
