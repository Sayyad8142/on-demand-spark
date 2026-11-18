#!/usr/bin/env bash
# Pre-release checks for the Worker App (does NOT build or publish anything).
# Fails if: version code did not increase vs. the highest uploaded build, versionName/code
# disagree with src/config/version.ts, targetSdk < 35, or signing material is inside the repo.
# Usage: scripts/android-release-check.sh <highest_uploaded_version_code>
set -euo pipefail
cd "$(dirname "$0")/.."
LAST="${1:-}"
if [[ ! "$LAST" =~ ^[1-9][0-9]{0,8}$ ]]; then
  echo "FAIL provide the confirmed highest uploaded Play Console version code (all tracks, including draft uploads)"; exit 1
fi
G=android/app/build.gradle
CODE=$(grep -Eo 'versionCode [0-9]+' "$G" | awk '{print $2}')
NAME=$(grep -Eo 'versionName "[^"]+"' "$G" | cut -d'"' -f2)
TARGET=$(grep -Eo 'targetSdk [0-9]+' "$G" | awk '{print $2}')
CFG_CODE=$(grep -Eo 'CURRENT_VERSION_CODE *= *[0-9]+' src/config/version.ts | grep -Eo '[0-9]+$')
CFG_NAME=$(grep -Eo "CURRENT_VERSION_NAME *= *['\"][^'\"]+" src/config/version.ts | grep -Eo "[^'\"]+$")
fail=0
echo "Gradle: $NAME ($CODE), targetSdk $TARGET | app config: $CFG_NAME ($CFG_CODE)"
[ "$CODE" = "$CFG_CODE" ] && [ "$NAME" = "$CFG_NAME" ] || { echo "FAIL version mismatch between Gradle and src/config/version.ts"; fail=1; }
[ "$TARGET" -ge 35 ] || { echo "FAIL targetSdk $TARGET < 35 (Play requirement)"; fail=1; }
[ "$CODE" -gt "$LAST" ] || { echo "FAIL versionCode $CODE must be greater than highest uploaded $LAST"; fail=1; }
if git ls-files 2>/dev/null | grep -Ei '\.(jks|keystore)$|keystore\.properties$'; then echo "FAIL signing files tracked in the repo"; fail=1; fi
[ $fail -eq 0 ] && echo "OK release checks passed" || exit 1
