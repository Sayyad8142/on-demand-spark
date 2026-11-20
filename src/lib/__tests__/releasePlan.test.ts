import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPhaseRequest, buildReport, main, planFromApproved, planNextRelease, readVersions, sendPhase } from "../../../scripts/release-plan.js";

const dirs: string[] = [];
function fixture(code: number, name: string, cfgCode = code, cfgName = name) {
  const root = mkdtempSync(join(tmpdir(), "relplan-"));
  dirs.push(root);
  mkdirSync(join(root, "android/app"), { recursive: true });
  mkdirSync(join(root, "src/config"), { recursive: true });
  writeFileSync(join(root, "android/app/build.gradle"), `defaultConfig {\n  versionCode ${code}\n  versionName "${name}"\n}\n`);
  writeFileSync(join(root, "src/config/version.ts"), `export const CURRENT_VERSION_CODE = ${cfgCode};\nexport const CURRENT_VERSION_NAME = '${cfgName}';\n`);
  return root;
}
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe("release planner", () => {
  it("keeps 10.0.04 (104) when Google Play's highest accepted build is 102", () => {
    expect(planNextRelease({ currentCode: 104, currentName: "10.0.04", highestAcceptedCode: 102 }))
      .toMatchObject({ status: "already_prepared", nextCode: 104, nextName: "10.0.04", changed: false });
  });
  it("moves to 10.0.05 (105) once 104 is accepted by Google Play", () => {
    expect(planNextRelease({ currentCode: 104, currentName: "10.0.04", highestAcceptedCode: 104 }))
      .toMatchObject({ status: "planned", nextCode: 105, nextName: "10.0.05" });
  });
  it("jumps past a higher build already uploaded to any track", () => {
    expect(planNextRelease({ currentCode: 104, currentName: "10.0.04", highestAcceptedCode: 107 }))
      .toMatchObject({ status: "planned", nextCode: 108, nextName: "10.0.08" });
  });
  it("refuses to guess without the store's highest build", () => {
    expect(planNextRelease({ currentCode: 104, currentName: "10.0.04", highestAcceptedCode: null }).status).toBe("needs_store_info");
  });
  it("asks for a manual name when the pattern overflows", () => {
    expect(planNextRelease({ currentCode: 104, currentName: "10.0.04", highestAcceptedCode: 199 }).status).toBe("needs_manual_name");
  });
  it("dry run changes nothing; --write updates Gradle and app config together", () => {
    const root = fixture(104, "10.0.04");
    expect(main(["--highest", "104"], root)).toBe(0);
    expect(readVersions(root)).toMatchObject({ code: 104, name: "10.0.04" });
    expect(main(["--highest", "104", "--write"], root)).toBe(0);
    expect(readVersions(root)).toMatchObject({ code: 105, name: "10.0.05", consistent: true });
  });
  it("refuses when Gradle and app config disagree", () => {
    const root = fixture(104, "10.0.04", 103);
    expect(main(["--highest", "102", "--write"], root)).toBe(1);
    expect(readFileSync(join(root, "src/config/version.ts"), "utf8")).toContain("= 103");
  });
  it("report leaves store, production and mandatory-update status to Admin", () => {
    const r = buildReport({ versions: { code: 104, name: "10.0.04", consistent: true }, plan: { status: "already_prepared", nextCode: 104, nextName: "10.0.04" }, aab: null });
    expect(r).toMatchObject({ aab: { present: false }, store_upload_status: null, production_availability: null, mandatory_update_status: null });
  });
});

describe("Admin Publishing Manager link", () => {
  const key = "drk_" + "a".repeat(48);
  const versions = { code: 104, name: "10.0.04", consistent: true };
  it("approved 10.0.04 (104) matches the current source without changes", () => {
    expect(planFromApproved({ currentCode: 104, currentName: "10.0.04", approvedName: "10.0.04", approvedCode: 104 }).status).toBe("already_prepared");
  });
  it("refuses an approved build that would lower or reuse the source build", () => {
    expect(planFromApproved({ currentCode: 104, currentName: "10.0.04", approvedName: "10.0.03", approvedCode: 103 }).status).toBe("approved_not_higher");
  });
  it("applies a higher approved version to both files", () => {
    const root = fixture(104, "10.0.04");
    expect(main(["--approved-version", "10.0.05", "--approved-build", "105", "--write"], root)).toBe(0);
    expect(readVersions(root)).toMatchObject({ code: 105, name: "10.0.05", consistent: true });
  });
  it("sends the report key only as a header and the source version in the body", () => {
    const r = buildPhaseRequest({ baseUrl: "https://x.supabase.co", anonKey: "anon", reportKey: key, phase: 3, status: "passed", evidence: "740 automated tests passed; real-device testing PENDING", versions });
    expect(r.url).toBe("https://x.supabase.co/functions/v1/app-release-report");
    expect(r.init.headers["x-release-key"]).toBe(key);
    expect(JSON.parse(r.init.body)).toEqual({ phase: 3, status: "passed", evidence: "740 automated tests passed; real-device testing PENDING", repo_version: "10.0.04", repo_build: 104 });
  });
  it("rejects malformed keys, other phases and missing evidence", () => {
    const base = { baseUrl: "https://x.supabase.co", anonKey: "anon", versions, evidence: "long enough evidence" };
    expect(() => buildPhaseRequest({ ...base, reportKey: "drk_short", phase: 2, status: "passed" })).toThrow();
    expect(() => buildPhaseRequest({ ...base, reportKey: key, phase: 5, status: "passed" })).toThrow();
    expect(() => buildPhaseRequest({ ...base, reportKey: key, phase: 2, status: "passed", evidence: "short" })).toThrow();
  });
  it("sends nothing without a report key", async () => {
    const root = fixture(104, "10.0.04");
    let called = false;
    const code = await sendPhase(["--send-phase", "2", "--status", "running"], root, async () => { called = true; return new Response("{}"); }, { VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "anon" });
    expect(code).toBe(1);
    expect(called).toBe(false);
  });
});
