# Worker App update system — Android test build checklist (2026-10-23)

Nothing published, no live update settings changed, no mandatory update switched on.

## Verified here (from source)
| Check | Result |
|---|---|
| Package | `app.didisnow.worker` (build.gradle applicationId, namespace, capacitor appId, google-services.json) |
| Build number | versionCode 102 / versionName 10.0.02 (`android/app/build.gradle`, matches `src/config/version.ts`) |
| Automated tests | 188/188 pass (`bun run test`) |
| Isolated update-testing environment | **NOT CONNECTED** — the app still points at the live backend (`paywwbuqycovjopryele`). No test environment address/key was provided. |
| Android compile, phone tests | **NOT RUN** (no Android tools or phone here) |

## Blocker before phone testing
The Admin Panel team must supply the isolated test environment (address + public key, or a test-only flag on `get_app_update_decision`). Without it, testing soft/force means editing live settings, which is not allowed.

## Build
GitHub → Actions → "Android APK (Capacitor)" → Run workflow → download `app-debug.apk`. Install on a phone **without** the Play Store app (same package, different signing key). Use the demo/test worker account only.

## Device checklist (all PENDING)
1. Settings → Apps → app info shows `app.didisnow.worker`, version 10.0.02 (102).
2. **None:** test env latest = 102, minimum = 1 → no sheet, no screen.
3. **Soft:** latest = 103 → half-screen sheet "A New Update Is Available!".
4. **Later:** tap Later → closed; reopen app → stays hidden; set phone date +3 days → shows again; set latest = 104 → shows immediately.
5. **Play link:** Update Now opens Play listing for `app.didisnow.worker` (not another app).
6. **Recheck on return:** while in Play, change test env to none → back in app the sheet/screen disappears without restart.
7. **Offer popup:** trigger a test offer, then set soft/force → popup stays on top; Accept and Reject both tappable; update shows only after offer ends.
8. **Active booking:** accept, minimum = 103 → banner "Update required after this job", no blocking screen; complete the job with OTP → full "Update Required" screen appears.
9. **Offline:** airplane mode → app opens normally, no update screen, no lockout.
10. **Unchanged:** availability toggle, booking notifications, and booking completion behave exactly as before in every step above.

## Remaining risks
- Test environment not yet connected (blocker above).
- Admin Panel worker setting still shows version 6.0.66 / build 1; must be corrected before any real switch-on.
- Second package entry `com.didinow.worker` in google-services.json is harmless but unused.
- Phone behaviour (Play return, locked screen, OEM battery limits) unverified until device run.
