#!/usr/bin/env bash
# Builds a signed Play Store bundle (AAB) locally. Never uploads or publishes.
# Signing: android/keystore.properties or DIDI_KEYSTORE_* env vars (kept outside the repo).
# Usage: scripts/android-build-aab.sh <last_released_version_code>
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/android-release-check.sh "${1:-}"
if [ ! -f android/keystore.properties ] && [ -z "${DIDI_KEYSTORE_FILE:-}" ]; then
  echo "FAIL no signing key configured (android/keystore.properties or DIDI_KEYSTORE_FILE)"; exit 1
fi
bun run icons:generate
bun run build
npx cap sync android
bun run android:verify-permissions
(cd android && ./gradlew clean bundleRelease)
AAB=android/app/build/outputs/bundle/release/app-release.aab
ls -la "$AAB"
command -v sha256sum >/dev/null && sha256sum "$AAB"
echo "Built $AAB — upload to Play Console manually (internal testing first)."
