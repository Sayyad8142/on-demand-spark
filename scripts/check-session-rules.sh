#!/usr/bin/env bash
# Compiles and runs the pure native login-refresh rules with plain kotlinc (no Android SDK).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
kotlinc android/app/src/main/java/app/didisnow/worker/SessionRefreshRules.kt scripts/session-rules-check/SessionRulesCheck.kt -include-runtime -d "$OUT/check.jar"
java -cp "$OUT/check.jar" SessionRulesCheckKt
