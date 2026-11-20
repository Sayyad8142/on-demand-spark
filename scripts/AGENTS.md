# Android release packaging

- Every APK/AAB packaging entry point, including CI and Android Studio/direct Gradle, must run the shared Android bundle verifier after a successful production web build and Capacitor sync; allow only the two Capacitor bridge files outside dist. Why: no release may silently package missing, mismatched or leftover web assets.
- Release version planning lives in `release-plan.js` (dry run unless `--write`; needs Google Play's highest accepted code, updates Gradle and `src/config/version.ts` together); reports go only to the Admin Publishing Manager's `app-release-report` with an env-only key. Why: no guessed version codes, and the Worker App never holds publishing credentials.
