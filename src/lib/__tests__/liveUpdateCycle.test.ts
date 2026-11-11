import { describe, it, expect, vi, beforeEach } from "vitest";

const stage = vi.fn();
const activate = vi.fn();
const prefs = new Map<string, string>();
const bundleRow = {
  version: "1.2.0",
  bundle_url: "https://paywwbuqycovjopryele.supabase.co/storage/v1/object/public/ota-bundles/w/1.2.0.zip",
  sha256: "b".repeat(64), size_bytes: 500, is_mandatory: false,
};

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" }, registerPlugin: () => ({}) }));
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void prefs.set(key, value),
    remove: async ({ key }: { key: string }) => void prefs.delete(key),
  },
}));
vi.mock("@/native/liveUpdateBridge", () => ({
  DidiLiveUpdatePlugin: { downloadAndStage: stage, activateStaged: activate, getStatus: async () => ({ failedVersions: [] }), confirmBoot: async () => {} },
}));
vi.mock("@/integrations/supabase/client", () => {
  const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: bundleRow, error: null }) };
  return { supabase: { from: () => q } };
});

import { runOtaCycle } from "@/lib/liveUpdate";

const idle = { bookingLoaded: true, activeBookingStatus: null, offerVisible: false, pathname: "/home" };

beforeEach(() => { stage.mockReset(); activate.mockReset(); prefs.clear(); });

describe("OTA cycle", () => {
  it("does nothing while the delivery switch is off", async () => {
    expect(await runOtaCycle(() => idle)).toEqual({ action: "none", why: "disabled" });
    expect(stage).not.toHaveBeenCalled();
  });

  it("never downloads during an active booking", async () => {
    expect(await runOtaCycle(() => ({ ...idle, activeBookingStatus: "on_the_way" }), true)).toEqual({ action: "wait" });
    expect(stage).not.toHaveBeenCalled();
  });

  it("an offer that arrives during the download keeps the old screen", async () => {
    let offer = false;
    stage.mockImplementation(async () => { offer = true; return { success: true }; });
    const d = await runOtaCycle(() => ({ ...idle, offerVisible: offer }), true);
    expect(d).toEqual({ action: "wait" });
    expect(activate).not.toHaveBeenCalled();
  });

  it("switches only when still idle after download", async () => {
    stage.mockResolvedValue({ success: true });
    activate.mockResolvedValue({ success: true });
    expect(await runOtaCycle(() => idle, true)).toEqual({ action: "apply" });
    expect(stage).toHaveBeenCalledWith(expect.objectContaining({ sha256: bundleRow.sha256, sizeBytes: 500 }));
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it("a fingerprint mismatch is remembered and not retried", async () => {
    stage.mockResolvedValue({ success: false, error: "sha256_mismatch" });
    await runOtaCycle(() => idle, true);
    stage.mockClear();
    expect(await runOtaCycle(() => idle, true)).toEqual({ action: "none", why: "previously_failed" });
    expect(stage).not.toHaveBeenCalled();
  });
});
