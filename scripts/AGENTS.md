# Android release packaging

- Every APK/AAB packaging entry point, including CI and Android Studio/direct Gradle, must run the shared Android bundle verifier after a successful production web build and Capacitor sync; allow only the two Capacitor bridge files outside dist. Why: no release may silently package missing, mismatched or leftover web assets.