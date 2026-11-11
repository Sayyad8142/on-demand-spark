import { describe, it, expect } from "vitest";
import { workBlockReason, isSafeToInterrupt } from "@/lib/workSafety";
import { decideOta, validateBundle, isApprovedBundleUrl, OTA_DELIVERY_ENABLED, type OtaBundleRow } from "@/lib/otaSafety";
import { decideUpdate } from "@/lib/updateDecision";
import { parseNativeAppInfo, recordVersionChange, VERSION_HISTORY_KEY } from "@/lib/installedVersion";
import { appendHealthEvent, scrubDetail, APP_HEALTH_MAX, readHealthLog } from "@/lib/appHealthLog";

const idle = { bookingLoaded: true, activeBookingStatus: null, offerVisible: false, pathname: "/home" };
const goodUrl = "https://paywwbuqycovjopryele.supabase.co/storage/v1/object/public/ota-bundles/worker/1.2.0.zip";
const bundle: OtaBundleRow = { version: "1.2.0", bundle_url: goodUrl, sha256: "a".repeat(64), size_bytes: 1000, is_mandatory: true };

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("work safety: never interrupt active work", () => {
  it("idle on home is safe", () => expect(isSafeToInterrupt(idle)).toBe(true));
  it("offer on screen blocks", () => expect(workBlockReason({ ...idle, offerVisible: true })).toBe("offer"));
  it("in_progress booking blocks", () => expect(workBlockReason({ ...idle, activeBookingStatus: "in_progress" })).toBe("active_booking"));
  for (const s of ["assigned", "accepted", "on_the_way", "started"]) {
    it(`${s} booking blocks`, () => expect(isSafeToInterrupt({ ...idle, activeBookingStatus: s })).toBe(false));
  }
  it("completed booking does not block", () => expect(isSafeToInterrupt({ ...idle, activeBookingStatus: "completed" })).toBe(true));
  it("Start OTP screen blocks", () => expect(workBlockReason({ ...idle, pathname: "/start-booking/abc" })).toBe("otp_screen"));
  it("End OTP screen blocks", () => expect(workBlockReason({ ...idle, pathname: "/complete-booking/abc" })).toBe("otp_screen"));
  it("bookings not loaded yet counts as busy", () => expect(workBlockReason({ ...idle, bookingLoaded: false })).toBe("booking_loading"));
});

describe("Play Store update prompts respect work", () => {
  const force = { decision: "force" as const, latestBuild: 110, minBuild: 105, storeUrl: undefined } as any;
  const soft = { decision: "soft" as const, latestBuild: 110, minBuild: null, storeUrl: undefined } as any;
  it("force is deferred while bookings are still loading", () =>
    expect(decideUpdate({ answer: force, bookingLoaded: false, now: 0 })).toBe("force_deferred"));
  it("force is deferred on the End OTP screen", () =>
    expect(decideUpdate({ answer: force, pathname: "/complete-booking/x", now: 0 })).toBe("force_deferred"));
  it("force is deferred during in_progress", () =>
    expect(decideUpdate({ answer: force, activeBookingStatus: "in_progress", now: 0 })).toBe("force_deferred"));
  it("soft prompt hidden on Start OTP screen", () =>
    expect(decideUpdate({ answer: soft, pathname: "/start-booking/x", now: 0 })).toBe("none"));
  it("soft prompt shows when idle", () => expect(decideUpdate({ answer: soft, bookingLoaded: true, pathname: "/home", now: 0 })).toBe("soft"));
});

describe("OTA bundle safety", () => {
  it("delivery switch is off", () => expect(OTA_DELIVERY_ENABLED).toBe(false));
  it("off means nothing happens even with a valid mandatory bundle", () =>
    expect(decideOta({ enabled: false, bundle, currentVersion: "1.0.0", failedVersions: [], work: idle })).toEqual({ action: "none", why: "disabled" }));
  it("missing SHA-256 is rejected", () => expect(validateBundle({ ...bundle, sha256: null })).toContain("missing_sha256"));
  it("missing size is rejected", () => expect(validateBundle({ ...bundle, size_bytes: null })).toContain("bad_size"));
  it("non-HTTPS or other host is rejected", () => {
    expect(isApprovedBundleUrl(goodUrl.replace("https", "http"))).toBe(false);
    expect(isApprovedBundleUrl("https://evil.example/storage/v1/object/public/ota-bundles/x.zip")).toBe(false);
    expect(isApprovedBundleUrl("https://paywwbuqycovjopryele.supabase.co.evil.com/storage/v1/object/public/ota-bundles/x.zip")).toBe(false);
  });
  it("path escape is rejected", () =>
    expect(isApprovedBundleUrl("https://paywwbuqycovjopryele.supabase.co/storage/v1/object/public/ota-bundles/%2e%2e/x.zip")).toBe(false));
  it("mandatory bundle waits during an active booking", () =>
    expect(decideOta({ enabled: true, bundle, currentVersion: "1.0.0", failedVersions: [], work: { ...idle, activeBookingStatus: "started" } })).toEqual({ action: "wait" }));
  it("waits while an offer is showing", () =>
    expect(decideOta({ enabled: true, bundle, currentVersion: "1.0.0", failedVersions: [], work: { ...idle, offerVisible: true } })).toEqual({ action: "wait" }));
  it("a previously failed version is never retried", () =>
    expect(decideOta({ enabled: true, bundle, currentVersion: "1.0.0", failedVersions: ["1.2.0"], work: idle })).toEqual({ action: "none", why: "previously_failed" }));
  it("same or older version is ignored", () =>
    expect(decideOta({ enabled: true, bundle, currentVersion: "1.2.0", failedVersions: [], work: idle })).toEqual({ action: "none", why: "not_newer" }));
  it("valid newer bundle applies only when idle", () =>
    expect(decideOta({ enabled: true, bundle, currentVersion: "1.0.0", failedVersions: [], work: idle })).toEqual({ action: "apply" }));
});

describe("installed version", () => {
  it("uses the phone's real version and build", () =>
    expect(parseNativeAppInfo({ version: "10.0.04", build: "104" }, "android")).toEqual({ version: "10.0.04", build: 104, platform: "android", source: "native" }));
  it("rejects junk build numbers", () => expect(parseNativeAppInfo({ version: "10.0.04", build: "abc" }, "android")).toBeNull());
  it("records a first launch after update", () => {
    const store = mem();
    const a = recordVersionChange(store, { version: "10.0.03", build: 103, platform: "android", source: "native" }, 1);
    expect(a.firstLaunch).toBe(true);
    const b = recordVersionChange(store, { version: "10.0.03", build: 103, platform: "android", source: "native" }, 2);
    expect(b.changed).toBe(false);
    const c = recordVersionChange(store, { version: "10.0.04", build: 104, platform: "android", source: "native" }, 3);
    expect(c.changed && !c.firstLaunch && c.previous?.build === 103).toBe(true);
    expect(JSON.parse(store.getItem(VERSION_HISTORY_KEY)!)).toHaveLength(2);
  });
});

describe("local health log", () => {
  it("removes tokens, phone numbers and OTP-like digits", () => {
    const out = scrubDetail("jwt eyJabc.def.ghi phone +91 98765 43210 otp 1234")!;
    expect(out).not.toMatch(/eyJabc|98765|1234/);
  });
  it("keeps at most the last 100 events", () => {
    const store = mem();
    for (let i = 0; i < APP_HEALTH_MAX + 5; i++) appendHealthEvent(store, { event: "app_start", at: i, version: "x", build: 1 });
    const log = readHealthLog(store);
    expect(log).toHaveLength(APP_HEALTH_MAX);
    expect(log[0].at).toBe(5);
  });
});
