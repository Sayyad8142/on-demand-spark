import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const assetsDir = join(process.cwd(), "android", "app", "src", "main", "assets", "public", "assets");

const requiredMarkers = [
  "[Permissions] Android app-launch flow",
  "opening overlay settings deferred to onboarding",
  "opening battery optimization settings deferred to onboarding",
  "push-guard-native-resume",
  "manual-repair-readback",
  "Booking_alert_connection_needs_attention",
  "Start_OTP_Delayed_Enter_OTP",
  "Waiting_for_Admin_Approval_You_can_start_receiving_bookings_once_your_account_is_approved",
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

const cssText = readdirSync(assetsDir).filter(name => name.endsWith(".css"))
  .map(name => readFileSync(join(assetsDir, name), "utf8")).join("\n");
if (!cssText.includes("booking-start-button-delayed")) {
  console.error("[verify-android-permission-bundle] Missing Start Booking delayed-alert styles. Run: bun run android:sync");
  process.exit(1);
}

// Byte-for-byte comparison proves sync used the current local production output,
// not merely an old bundle that happens to contain a few expected strings.
const distDir = join(process.cwd(), "dist");
const publicDir = join(process.cwd(), "android", "app", "src", "main", "assets", "public");
if (!existsSync(join(distDir, "index.html"))) {
  console.error("[verify-android-permission-bundle] Missing production dist/index.html. Build locally, then sync Android before release.");
  process.exit(1);
}
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
}
for (const file of files(distDir)) {
  const destination = join(publicDir, relative(distDir, file));
  if (!existsSync(destination) || !readFileSync(file).equals(readFileSync(destination))) {
    console.error(`[verify-android-permission-bundle] Android differs from dist: ${relative(distDir, file)}. Run: npx cap sync android`);
    process.exit(1);
  }
}

console.log("[verify-android-permission-bundle] OK: notification/approval/OTP markers present and Android matches the current production dist.");