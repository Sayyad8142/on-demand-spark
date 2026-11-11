/**
 * OTA (download-and-reload) bundle safety rules. Pure functions; the native plugin
 * repeats the same checks (it never trusts JS). Delivery stays OFF until the owner
 * approves after device testing.
 */
import { isSafeToInterrupt, type WorkState } from "@/lib/workSafety";

/** Kill switch. OFF = the app never downloads, applies or reloads an OTA bundle. */
export const OTA_DELIVERY_ENABLED = false;

/** Only the project's public ota-bundles storage bucket, over HTTPS. */
export const OTA_APPROVED_HOST = "paywwbuqycovjopryele.supabase.co";
export const OTA_APPROVED_PATH_PREFIX = "/storage/v1/object/public/ota-bundles/";
export const OTA_MAX_BUNDLE_BYTES = 30 * 1024 * 1024;

export interface OtaBundleRow {
  version: string;
  bundle_url: string;
  sha256: string | null;
  size_bytes: number | null;
  is_mandatory?: boolean;
}

export type OtaRejectReason = "bad_version" | "bad_url" | "missing_sha256" | "bad_size";

export function isSafeBundleVersion(v: unknown): v is string {
  return typeof v === "string" && /^\d{1,4}(\.\d{1,4}){0,3}$/.test(v);
}

export function isValidSha256(v: unknown): v is string {
  return typeof v === "string" && /^[a-f0-9]{64}$/i.test(v);
}

export function isApprovedBundleUrl(raw: unknown): boolean {
  if (typeof raw !== "string" || raw.length > 1000) return false;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.hostname !== OTA_APPROVED_HOST || u.port !== "" || u.username || u.password) return false;
    if (!u.pathname.startsWith(OTA_APPROVED_PATH_PREFIX)) return false;
    const rest = decodeURIComponent(u.pathname.slice(OTA_APPROVED_PATH_PREFIX.length));
    return rest.length > 0 && !rest.split("/").some((seg) => seg === ".." || seg === ".") && rest.endsWith(".zip");
  } catch {
    return false;
  }
}

export function validateBundle(b: OtaBundleRow | null | undefined): OtaRejectReason[] {
  if (!b) return ["bad_version"];
  const r: OtaRejectReason[] = [];
  if (!isSafeBundleVersion(b.version)) r.push("bad_version");
  if (!isApprovedBundleUrl(b.bundle_url)) r.push("bad_url");
  if (!isValidSha256(b.sha256)) r.push("missing_sha256");
  if (typeof b.size_bytes !== "number" || !Number.isInteger(b.size_bytes) || b.size_bytes <= 0 || b.size_bytes > OTA_MAX_BUNDLE_BYTES) r.push("bad_size");
  return r;
}

/** true if a > b (numeric dotted). Non-numeric parts count as 0. */
export function isNewerVersion(a: string, b: string): boolean {
  const pa = a.split(".").map((x) => Number(x) || 0);
  const pb = b.split(".").map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

export type OtaDecision =
  | { action: "none"; why: "disabled" | "no_bundle" | "not_newer" | "previously_failed" }
  | { action: "reject"; reasons: OtaRejectReason[] }
  | { action: "wait" }      // valid update, but the worker is busy
  | { action: "apply" };    // valid update, safe moment

/**
 * Mandatory bundles are treated exactly like optional ones: they never block the screen
 * (forced updates stay off) and never apply during work.
 */
export function decideOta(args: {
  enabled: boolean;
  bundle: OtaBundleRow | null;
  currentVersion: string;
  failedVersions: readonly string[];
  work: WorkState;
}): OtaDecision {
  const { enabled, bundle, currentVersion, failedVersions, work } = args;
  if (!enabled) return { action: "none", why: "disabled" };
  if (!bundle) return { action: "none", why: "no_bundle" };
  const reasons = validateBundle(bundle);
  if (reasons.length) return { action: "reject", reasons };
  if (!isNewerVersion(bundle.version, currentVersion)) return { action: "none", why: "not_newer" };
  if (failedVersions.includes(bundle.version)) return { action: "none", why: "previously_failed" };
  return isSafeToInterrupt(work) ? { action: "apply" } : { action: "wait" };
}
