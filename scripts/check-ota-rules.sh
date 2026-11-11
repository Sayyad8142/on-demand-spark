#!/usr/bin/env bash
# Compiles and runs the pure native OTA rules (android/.../OtaRules.kt) with plain kotlinc.
# Needs kotlinc + java on PATH (no Android SDK required).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
kotlinc android/app/src/main/java/app/didisnow/worker/OtaRules.kt scripts/ota-rules-check/OtaRulesCheck.kt -include-runtime -d "$OUT/check.jar"
java -cp "$OUT/check.jar" OtaRulesCheckKt
