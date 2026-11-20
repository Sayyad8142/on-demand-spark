#!/usr/bin/env node
/**
 * Worker App release planner for the Admin Publishing Manager.
 * Computes the next valid Play versionCode/versionName from the highest code Google Play
 * already accepted (all tracks). Dry run by default; --write updates Gradle + src/config/version.ts
 * together. Never builds, uploads, publishes or touches update policy.
 *
 * Usage: node scripts/release-plan.js --highest <code> [--write] [--report <file.json>]
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const GRADLE_PATH = "android/app/build.gradle";
export const VERSION_TS_PATH = "src/config/version.ts";
export const AAB_PATH = "android/app/build/outputs/bundle/release/app-release.aab";

const isCode = (n) => Number.isInteger(n) && n > 0 && n <= 2100000000;

/** Next valid version. A current code above the store's highest is already the next release. */
export function planNextRelease({ currentCode, currentName, highestAcceptedCode }) {
  if (!isCode(currentCode)) return { status: "invalid_current", reason: "current versionCode is not a valid number" };
  if (highestAcceptedCode === null || highestAcceptedCode === undefined) {
    return { status: "needs_store_info", reason: "highest Google Play versionCode (all tracks) is required" };
  }
  if (!isCode(highestAcceptedCode)) return { status: "invalid_store_info", reason: "highest Google Play versionCode is not a valid number" };
  if (currentCode > highestAcceptedCode) {
    return { status: "already_prepared", currentCode, currentName, nextCode: currentCode, nextName: currentName, changed: false };
  }
  const nextCode = highestAcceptedCode + 1;
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(currentName ?? ""));
  if (!m) return { status: "needs_manual_name", reason: "versionName is not in major.minor.patch form", nextCode };
  const width = m[3].length;
  const offset = currentCode - Number(m[3]);
  const patch = nextCode - offset;
  if (offset < 0 || patch < 0 || String(patch).length > width) {
    return { status: "needs_manual_name", reason: "next build number no longer fits the current version name pattern", nextCode };
  }
  const nextName = `${m[1]}.${m[2]}.${String(patch).padStart(width, "0")}`;
  return { status: "planned", currentCode, currentName, nextCode, nextName, changed: true };
}

export function readVersions(root) {
  const gradle = readFileSync(join(root, GRADLE_PATH), "utf8");
  const ts = readFileSync(join(root, VERSION_TS_PATH), "utf8");
  const code = Number(/versionCode\s+(\d+)/.exec(gradle)?.[1]);
  const name = /versionName\s+"([^"]+)"/.exec(gradle)?.[1] ?? null;
  const cfgCode = Number(/CURRENT_VERSION_CODE\s*=\s*(\d+)/.exec(ts)?.[1]);
  const cfgName = /CURRENT_VERSION_NAME\s*=\s*['"]([^'"]+)['"]/.exec(ts)?.[1] ?? null;
  return { code, name, consistent: code === cfgCode && name === cfgName, appConfig: { code: cfgCode, name: cfgName } };
}

export function applyVersions(root, plan) {
  if (plan.status !== "planned") return false;
  const gp = join(root, GRADLE_PATH), tp = join(root, VERSION_TS_PATH);
  const gradle = readFileSync(gp, "utf8")
    .replace(/versionCode\s+\d+/, `versionCode ${plan.nextCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${plan.nextName}"`);
  const ts = readFileSync(tp, "utf8")
    .replace(/CURRENT_VERSION_CODE\s*=\s*\d+/, `CURRENT_VERSION_CODE = ${plan.nextCode}`)
    .replace(/CURRENT_VERSION_NAME\s*=\s*['"][^'"]+['"]/, `CURRENT_VERSION_NAME = '${plan.nextName}'`);
  writeFileSync(gp, gradle);
  writeFileSync(tp, ts);
  return true;
}

/**
 * Local release-status report for the Admin Publishing Manager. Only facts this machine knows;
 * store upload, production availability and mandatory-update status stay owned by Admin (null).
 */
export function buildReport({ versions, plan, aab, tests = null, now = new Date() }) {
  return {
    contract_version: 1,
    app: "worker",
    platform: "android",
    generated_at: now.toISOString(),
    current_version: { name: versions.name, code: versions.code },
    next_version: plan.nextCode ? { name: plan.nextName ?? null, code: plan.nextCode } : null,
    plan_status: plan.status,
    plan_reason: plan.reason ?? null,
    build_validation: { versions_consistent: versions.consistent },
    tests,
    aab: aab ? { present: true, bytes: aab.bytes, sha256: aab.sha256 } : { present: false },
    store_upload_status: null,
    production_availability: null,
    mandatory_update_status: null,
  };
}

function aabInfo(root) {
  const p = join(root, AAB_PATH);
  if (!existsSync(p)) return null;
  const buf = readFileSync(p);
  return { bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
}

function arg(argv, name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; }

export function main(argv = process.argv.slice(2), root = process.cwd()) {
  const raw = arg(argv, "--highest");
  const highest = raw === undefined ? null : /^\d+$/.test(raw) ? Number(raw) : NaN;
  const versions = readVersions(root);
  if (!versions.consistent) { console.error("FAIL Gradle and src/config/version.ts disagree"); return 1; }
  const plan = planNextRelease({ currentCode: versions.code, currentName: versions.name, highestAcceptedCode: highest });
  let wrote = false;
  if (argv.includes("--write")) wrote = applyVersions(root, plan);
  const reportPath = arg(argv, "--report");
  if (reportPath) writeFileSync(resolve(root, reportPath), JSON.stringify(buildReport({ versions, plan, aab: aabInfo(root) }), null, 2));
  console.log(JSON.stringify({ ...plan, wrote }));
  return ["planned", "already_prepared"].includes(plan.status) ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
