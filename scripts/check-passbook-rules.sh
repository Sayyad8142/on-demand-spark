#!/usr/bin/env bash
# Compiles and runs the pure native passbook OCR layout rules with plain kotlinc (no Android SDK).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
kotlinc android/app/src/main/java/app/didisnow/worker/PassbookOcrRules.kt scripts/passbook-rules-check/PassbookRulesCheck.kt -include-runtime -d "$OUT/check.jar"
java -cp "$OUT/check.jar" PassbookRulesCheckKt
