# Prompt 91 — Pilot selection (Sid) — 2026-11-12

- Sid account: ONE worker named "Sid" (worker id = login id 8e03deed…, phone ending 6396, active, matching login exists, no other worker on that phone). YES.
- Android device: ONE active Android token (fingerprint 28da92ed…), same token in both token tables, app 10.0.03. YES.
- Pilot restriction: PRACTICE_PILOT_USER_ID + PRACTICE_PILOT_TOKEN_SHA256 set (fingerprint only, never the token). If Sid's token changes, the sender refuses (device_mismatch) until the fingerprint is updated.
- Switch: PRACTICE_PUSH_SENDER still `off`; app PRACTICE_PUSH_ENABLED still off. Hosted check after pilot set: no login / fake login → 503 approval_required, sent:false.
- Journal: 0 attempts; no anon/authenticated access.
- Firebase validate-only: NOT RUN. The sender needs a request signed with Sid's own login; this project cannot mint a login for him from here and the app button is off. Needs Sid to tap the button in a test build while the switch is temporarily `validate` (no delivery).
- Ready for one-phone test: NO-GO until validate-only passes.
