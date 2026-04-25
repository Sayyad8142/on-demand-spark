import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const assetsDir = join(process.cwd(), "android", "app", "src", "main", "assets", "public", "assets");

const requiredMarkers = [
  "[Permissions] Android app-launch flow",
  "opening overlay settings deferred to onboarding",
  "opening battery optimization settings deferred to onboarding",
  "[PermissionOnboarding] 👆 Enable tapped",
  "[PermissionOnboarding] App resumed — re-running checkAllPermissions()",
];

if (!existsSync(assetsDir)) {
  console.error(`[verify-android-permission-bundle] Missing Android assets directory: ${assetsDir}`);
  process.exit(1);
}

const jsFiles = readdirSync(assetsDir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => join(assetsDir, name));

const bundleText = jsFiles.map((file) => readFileSync(file, "utf8")).join("\n");
const missing = requiredMarkers.filter((marker) => !bundleText.includes(marker));

if (missing.length > 0) {
  console.error("[verify-android-permission-bundle] Android web bundle is stale or incomplete.");
  console.error("Missing markers:");
  missing.forEach((marker) => console.error(`- ${marker}`));
  console.error("Run: bun run android:sync");
  process.exit(1);
}

console.log("[verify-android-permission-bundle] OK: Android bundle contains permission startup flow markers.");