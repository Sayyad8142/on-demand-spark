import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { CURRENT_VERSION_CODE, CURRENT_VERSION_NAME } from "@/config/version";
import { NEXT_BOOKING_LIVE_ENABLED } from "@/lib/nextBooking";

const temporary: string[] = [];
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function check(args: string[], configCode = 105) {
  const root = mkdtempSync(join(tmpdir(), "worker-release-"));
  temporary.push(root);
  for (const folder of ["scripts", "android/app", "src/config"]) mkdirSync(join(root, folder), { recursive: true });
  writeFileSync(join(root, "scripts/android-release-check.sh"), readFileSync("scripts/android-release-check.sh"));
  writeFileSync(join(root, "android/app/build.gradle"), 'versionCode 105\nversionName "10.0.05"\ntargetSdk 36\n');
  writeFileSync(join(root, "src/config/version.ts"), `export const CURRENT_VERSION_CODE = ${configCode};\nexport const CURRENT_VERSION_NAME = '10.0.05';\n`);
  return spawnSync("bash", [join(root, "scripts/android-release-check.sh"), ...args], { cwd: root, encoding: "utf8" });
}

function bundleCheck({ hasDist = true, differs = false, delayedStyles = true, extra = "" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "worker-bundle-"));
  temporary.push(root);
  const assets = join(root, "android/app/src/main/assets/public/assets");
  mkdirSync(assets, { recursive: true });
  const script = join(root, "check.mjs");
  writeFileSync(script, readFileSync("scripts/verify-android-permission-bundle.js"));
  const markers = ["[Permissions] Android app-launch flow", "opening overlay settings deferred to onboarding", "opening battery optimization settings deferred to onboarding", "push-guard-native-resume", "manual-repair-readback", "Booking_alert_connection_needs_attention", "Start_OTP_Delayed_Enter_OTP", "Waiting_for_Admin_Approval_You_can_start_receiving_bookings_once_your_account_is_approved"].join("\n");
  writeFileSync(join(assets, "app.js"), markers);
  writeFileSync(join(assets, "app.css"), delayedStyles ? ".booking-start-button-delayed{}" : ".old-style{}");
  writeFileSync(join(root, "android/app/src/main/assets/public/index.html"), "current");
  if (extra) writeFileSync(join(root, "android/app/src/main/assets/public", extra), "extra");
  if (hasDist) {
    mkdirSync(join(root, "dist/assets"), { recursive: true });
    writeFileSync(join(root, "dist/index.html"), differs ? "newer" : "current");
    writeFileSync(join(root, "dist/assets/app.js"), markers);
    writeFileSync(join(root, "dist/assets/app.css"), delayedStyles ? ".booking-start-button-delayed{}" : ".old-style{}");
  }
  return spawnSync("node", [script], { cwd: root, encoding: "utf8" });
}

describe("Android release guards", () => {
  it("keeps requested version 10.0.06 build 106", () => {
    expect(CURRENT_VERSION_NAME).toBe("10.0.06");
    expect(CURRENT_VERSION_CODE).toBe(106);
  });
  it("accepts candidate 106 only when the confirmed highest upload is lower", () => {
    expect(check(["103"]).status).toBe(0);
  });
  it("refuses reused build 106", () => {
    expect(check(["106"]).status).toBe(1);
  });
  it("refuses a candidate below a previously uploaded build", () => {
    expect(check(["105"]).status).toBe(1);
  });
  it("refuses unknown Play upload history", () => {
    expect(check([]).status).toBe(1);
  });
  it("refuses invalid upload history", () => {
    for (const input of ["unknown", "103x", "0", "-1", "103.5"]) expect(check([input]).status).toBe(1);
  });
  it("refuses Android and in-app version disagreement", () => {
    expect(check(["103"], 103).status).toBe(1);
  });
  it("keeps actual project versions aligned", () => {
    const gradle = readFileSync("android/app/build.gradle", "utf8");
    expect(Number(gradle.match(/versionCode\s+(\d+)/)?.[1])).toBe(CURRENT_VERSION_CODE);
    expect(gradle.match(/versionName\s+"([^"]+)"/)?.[1]).toBe(CURRENT_VERSION_NAME);
  });
  it("preserves the existing Android package", () => {
    expect(readFileSync("android/app/build.gradle", "utf8").match(/applicationId\s+"([^"]+)"/)?.[1]).toBe("app.didisnow.worker");
  });
  it("keeps production Next Booking activation disabled", () => {
    expect(NEXT_BOOKING_LIVE_ENABLED).toBe(false);
  });
  it("requires production assets even if packaged feature markers are present", () => {
    expect(bundleCheck({ hasDist: false }).status).toBe(1);
  });
  it("refuses Android assets differing from the current production build", () => {
    expect(bundleCheck({ differs: true }).status).toBe(1);
  });
  it("refuses a bundle missing the Start Booking delayed alert", () => {
    expect(bundleCheck({ delayedStyles: false }).status).toBe(1);
  });
  it("accepts matching production and Android assets with all feature markers", () => {
    expect(bundleCheck().status).toBe(0);
  });
  it("refuses stale extra Android assets not in the production output", () => {
    expect(bundleCheck({ extra: "sw.js" }).status).toBe(1);
  });
  it("allows the two bridge files generated by Capacitor", () => {
    for (const extra of ["cordova.js", "cordova_plugins.js"]) expect(bundleCheck({ extra }).status).toBe(0);
  });
});