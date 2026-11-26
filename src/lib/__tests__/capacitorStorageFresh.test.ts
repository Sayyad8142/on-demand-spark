import { beforeEach, describe, expect, it, vi } from "vitest";

const store: Record<string, string> = {};
let releaseSet: (() => void) | null = null;
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    keys: async () => ({ keys: Object.keys(store) }),
    get: async ({ key }: { key: string }) => ({ value: store[key] ?? null }),
    set: ({ key, value }: { key: string; value: string }) =>
      new Promise<void>((resolve) => { releaseSet = () => { store[key] = value; resolve(); }; }),
    remove: async ({ key }: { key: string }) => { delete store[key]; },
  },
}));

describe("login storage on the phone", () => {
  beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; vi.resetModules(); releaseSet = null; });

  it("reads a login refreshed by the Android background code, not the stale app copy", async () => {
    store["didi-worker-session"] = "old";
    const m = await import("@/lib/capacitorStorage");
    await m.initializeStorageCache();
    store["didi-worker-session"] = "refreshed-by-android";
    expect(await m.capacitorStorage.getItem("didi-worker-session")).toBe("refreshed-by-android");
  });

  it("while the app is still saving a new login, returns the app's newer copy", async () => {
    store["didi-worker-session"] = "old";
    const m = await import("@/lib/capacitorStorage");
    await m.initializeStorageCache();
    const saving = m.capacitorStorage.setItem("didi-worker-session", "new-from-app");
    expect(await m.capacitorStorage.getItem("didi-worker-session")).toBe("new-from-app");
    releaseSet?.();
    await saving;
  });
});
