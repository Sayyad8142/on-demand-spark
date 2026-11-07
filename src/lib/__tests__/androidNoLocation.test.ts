import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Rule: Didi Now never tracks worker location, and a phone restart must not
// start tracking services. These checks fail if location tracking comes back.
const root = join(__dirname, "../../../android/app/src/main");
const javaDir = join(root, "java/app/didisnow/worker");

describe("Android startup without location tracking", () => {
  it("no location-tracking service, worker or plugin exists", () => {
    const files = readdirSync(javaDir);
    expect(files.filter((f) => /^Location/.test(f))).toEqual([]);
  });

  it("restart handler never starts tracking services", () => {
    const boot = readFileSync(join(javaDir, "BootReceiver.kt"), "utf8");
    expect(boot).not.toMatch(/LocationTrackingService|LocationUpdateWorker|MovementTrackingService\.start/);
  });

  it("the manifest asks for no location permission", () => {
    const manifest = readFileSync(join(root, "AndroidManifest.xml"), "utf8");
    expect(manifest).not.toMatch(/ACCESS_(FINE|COARSE|BACKGROUND)_LOCATION/);
  });
});
