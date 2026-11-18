import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { CURRENT_VERSION_CODE, CURRENT_VERSION_NAME } from "@/config/version";
import { NEXT_BOOKING_LIVE_ENABLED } from "@/lib/nextBooking";

const temporary: string[] = [];
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function check(args: string[], configCode = 104) {
  const root = mkdtempSync(join(tmpdir(), "worker-release-"));
  temporary.push(root);
  for (const folder of ["scripts", "android/app", "src/config"]) mkdirSync(join(root, folder), { recursive: true });
  writeFileSync(join(root, "scripts/android-release-check.sh"), readFileSync("scripts/android-release-check.sh"));
  writeFileSync(join(root, "android/app/build.gradle"), 'versionCode 104\nversionName "10.0.04"\ntargetSdk 36\n');
  writeFileSync(join(root, "src/config/version.ts"), `export const CURRENT_VERSION_CODE = ${configCode};\nexport const CURRENT_VERSION_NAME = '10.0.04';\n`);
  return spawnSync("bash", [join(root, "scripts/android-release-check.sh"), ...args], { cwd: root, encoding: "utf8" });
}

describe("Android release guards", () => {
  it("prepares requested version 10.0.04 build 104 provisionally", () => {
    expect(CURRENT_VERSION_NAME).toBe("10.0.04");
    expect(CURRENT_VERSION_CODE).toBe(104);
  });
  it("accepts candidate 104 only when the confirmed highest upload is lower", () => {
    expect(check(["103"]).status).toBe(0);
  });
  it("refuses reused build 104", () => {
    expect(check(["104"]).status).toBe(1);
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
});