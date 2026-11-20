#!/usr/bin/env node
/**
 * Worker App release planner for the Admin Publishing Manager.
 * Computes the next valid Play versionCode/versionName from the highest code Google Play
 * already accepted (all tracks). Dry run by default; --write updates Gradle + src/config/version.ts
 * together. Never builds, uploads, publishes or touches update policy.
 *
 * Usage:
 *   node scripts/release-plan.js --highest <code> [--write] [--report <file.json>]
 *   node scripts/release-plan.js --approved-version <name> --approved-build <code> [--write]
 *     (values shown by the Admin Publishing Manager release; never lowers the current build)
 *   DIDI_RELEASE_REPORT_KEY=drk_... node scripts/release-plan.js --send-phase <2|3> --status <running|passed|failed> --evidence "<text>"
 *     (posts to the Admin `app-release-report` function; the key stays in the environment, never the repo or app)
 *   DIDI_RELEASE_REPORT_KEY=drk_... node scripts/release-plan.js --fetch-approved [--write]
 *     (GET the Admin-approved version/build and apply it exactly; never computed locally)
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

/** Approved version from the Admin release; equal = already applied, lower build = refused. */
export function planFromApproved({ currentCode, currentName, approvedName, approvedCode }) {
  if (!isCode(approvedCode) || !/^\d+\.\d+(\.\d+)?$/.test(String(approvedName ?? ""))) {
    return { status: "invalid_approved", reason: "approved version name and build are required" };
  }
  if (approvedCode === currentCode && approvedName === currentName) {
    return { status: "already_prepared", currentCode, currentName, nextCode: currentCode, nextName: currentName, changed: false };
  }
  if (approvedCode <= currentCode) {
    return { status: "approved_not_higher", reason: `approved build ${approvedCode} is not higher than source build ${currentCode}`, nextCode: approvedCode };
  }
  return { status: "planned", currentCode, currentName, nextCode: approvedCode, nextName: approvedName, changed: true };
}

export const REPORT_KEY_PATTERN = /^drk_[0-9a-f]{48}$/;
export const REPORT_FUNCTION = "app-release-report";

/** Builds the Admin report request. Real-device testing is always stated as pending unless evidence says otherwise. */
export function buildPhaseRequest({ baseUrl, anonKey, reportKey, phase, status, evidence, versions }) {
  if (!REPORT_KEY_PATTERN.test(String(reportKey ?? ""))) throw new Error("DIDI_RELEASE_REPORT_KEY missing or malformed");
  if (![2, 3].includes(phase)) throw new Error("phase must be 2 or 3");
  if (!["running", "passed", "failed"].includes(status)) throw new Error("status must be running, passed or failed");
  const text = String(evidence ?? "").trim();
  if (status !== "running" && text.length < 10) throw new Error("evidence must be at least 10 characters");
  if (!/^https:\/\//.test(String(baseUrl ?? "")) || !anonKey) throw new Error("backend URL and publishable key are required");
  return {
    url: `${baseUrl.replace(/\/$/, "")}/functions/v1/${REPORT_FUNCTION}`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json", apikey: anonKey, "x-release-key": reportKey },
      body: JSON.stringify({ phase, status, evidence: text, repo_version: versions.name, repo_build: versions.code }),
    },
  };
}

/** GET request for the Admin-approved release (same endpoint and key as the reports). */
export function buildApprovedRequest({ baseUrl, anonKey, reportKey }) {
  if (!REPORT_KEY_PATTERN.test(String(reportKey ?? ""))) throw new Error("DIDI_RELEASE_REPORT_KEY missing or malformed");
  if (!/^https:\/\//.test(String(baseUrl ?? "")) || !anonKey) throw new Error("backend URL and publishable key are required");
  return {
    url: `${baseUrl.replace(/\/$/, "")}/functions/v1/${REPORT_FUNCTION}`,
    init: { method: "GET", headers: { apikey: anonKey, "x-release-key": reportKey } },
  };
}

const pick = (o, keys) => { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k]; return undefined; };

/** Strictly reads Admin's answer. Anything unexpected → refused; nothing is guessed. */
export function parseApprovedResponse(body) {
  let data;
  try { data = typeof body === "string" ? JSON.parse(body) : body; } catch { return { ok: false, reason: "response is not JSON" }; }
  if (!data || typeof data !== "object") return { ok: false, reason: "empty response" };
  if (data.error) return { ok: false, reason: String(data.error).slice(0, 200) };
  const r = data.release && typeof data.release === "object" ? data.release : data;
  const app = pick(r, ["app"]); const platform = pick(r, ["platform"]);
  if (app !== undefined && app !== "worker") return { ok: false, reason: `release is for app "${app}", not worker` };
  if (platform !== undefined && platform !== "android") return { ok: false, reason: `release is for platform "${platform}", not android` };
  const name = pick(r, ["version", "version_name", "approved_version"]);
  const code = pick(r, ["build", "build_number", "version_code", "approved_build"]);
  if (typeof name !== "string" || !/^\d+\.\d+(\.\d+)?$/.test(name)) return { ok: false, reason: "approved version missing or malformed" };
  if (!Number.isInteger(code) || !isCode(code)) return { ok: false, reason: "approved build missing or not a whole number" };
  return { ok: true, approvedName: name, approvedCode: code };
}

export async function fetchApproved(argv, root, fetchImpl = fetch, env = process.env) {
  const versions = readVersions(root);
  if (!versions.consistent) { console.error("FAIL Gradle and src/config/version.ts disagree"); return 1; }
  const file = readEnvFile(root);
  try {
    const req = buildApprovedRequest({
      baseUrl: env.VITE_SUPABASE_URL || file.VITE_SUPABASE_URL,
      anonKey: env.VITE_SUPABASE_PUBLISHABLE_KEY || file.VITE_SUPABASE_PUBLISHABLE_KEY,
      reportKey: env.DIDI_RELEASE_REPORT_KEY,
    });
    const res = await fetchImpl(req.url, req.init);
    const text = await res.text();
    if (!res.ok) { console.error(JSON.stringify({ ok: false, http: res.status, response: text.slice(0, 300) })); return 1; }
    const parsed = parseApprovedResponse(text);
    if (!parsed.ok) { console.error(`FAIL ${parsed.reason}`); return 1; }
    const plan = planFromApproved({ currentCode: versions.code, currentName: versions.name, ...parsed });
    let wrote = false;
    if (plan.status === "planned" && argv.includes("--write")) wrote = applyVersions(root, plan);
    console.log(JSON.stringify({ approved: parsed, plan, wrote }));
    return plan.status === "planned" || plan.status === "already_prepared" ? 0 : 1;
  } catch (e) { console.error(`FAIL ${e.message}`); return 1; }
}

function readEnvFile(root) {
  try {
    return Object.fromEntries(readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)
      .map((l) => /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2]]));
  } catch { return {}; }
}

export async function sendPhase(argv, root, fetchImpl = fetch, env = process.env) {
  const versions = readVersions(root);
  if (!versions.consistent) { console.error("FAIL Gradle and src/config/version.ts disagree"); return 1; }
  const file = readEnvFile(root);
  try {
    const req = buildPhaseRequest({
      baseUrl: env.VITE_SUPABASE_URL || file.VITE_SUPABASE_URL,
      anonKey: env.VITE_SUPABASE_PUBLISHABLE_KEY || file.VITE_SUPABASE_PUBLISHABLE_KEY,
      reportKey: env.DIDI_RELEASE_REPORT_KEY,
      phase: Number(arg(argv, "--send-phase")), status: arg(argv, "--status"), evidence: arg(argv, "--evidence"), versions,
    });
    const res = await fetchImpl(req.url, req.init);
    const body = await res.text();
    console.log(JSON.stringify({ ok: res.ok, http: res.status, response: body.slice(0, 500) }));
    return res.ok ? 0 : 1;
  } catch (e) { console.error(`FAIL ${e.message}`); return 1; }
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
  const approvedName = arg(argv, "--approved-version");
  const approvedRaw = arg(argv, "--approved-build");
  const raw = arg(argv, "--highest");
  const highest = raw === undefined ? null : /^\d+$/.test(raw) ? Number(raw) : NaN;
  const versions = readVersions(root);
  if (!versions.consistent) { console.error("FAIL Gradle and src/config/version.ts disagree"); return 1; }
  const plan = approvedName !== undefined || approvedRaw !== undefined
    ? planFromApproved({ currentCode: versions.code, currentName: versions.name, approvedName, approvedCode: /^\d+$/.test(approvedRaw ?? "") ? Number(approvedRaw) : NaN })
    : planNextRelease({ currentCode: versions.code, currentName: versions.name, highestAcceptedCode: highest });
  let wrote = false;
  if (argv.includes("--write")) wrote = applyVersions(root, plan);
  const reportPath = arg(argv, "--report");
  if (reportPath) writeFileSync(resolve(root, reportPath), JSON.stringify(buildReport({ versions, plan, aab: aabInfo(root) }), null, 2));
  console.log(JSON.stringify({ ...plan, wrote }));
  return ["planned", "already_prepared"].includes(plan.status) ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes("--fetch-approved")) fetchApproved(argv, process.cwd()).then((c) => process.exit(c));
  else if (argv.includes("--send-phase")) sendPhase(argv, process.cwd()).then((c) => process.exit(c));
  else process.exit(main(argv));
}
