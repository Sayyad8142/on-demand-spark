#!/bin/bash

# Increment version
echo "📦 Incrementing version..."
node ../scripts/increment-version.js

if [ $? -ne 0 ]; then
  echo "❌ Failed to increment version"
  exit 1
fi

# Build the AAB
echo "🚀 Building release AAB..."
./gradlew bundleRelease

if [ $? -eq 0 ]; then
  echo "✅ AAB built successfully!"
  echo "📍 Location: android/app/build/outputs/bundle/release/app-release.aab"
else
  echo "❌ Build failed"
  exit 1
fi
