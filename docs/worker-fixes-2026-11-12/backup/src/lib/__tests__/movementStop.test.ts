import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  let releasePermission!: (v: { granted: boolean }) => void;
  const plugin = {
    checkSupport: vi.fn(async () => ({ supported: true, sensorType: "step_counter" })),
    checkPermission: vi.fn(async () => ({ granted: true })),
    requestPermission: vi.fn(() => new Promise<{ granted: boolean }>((r) => { releasePermission = r; })),
    startMonitoring: vi.fn(async () => ({ status: "ok", bookingId: "b1" })),
    stopMonitoring: vi.fn(async () => {}),
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  };
  return { plugin, release: (g: boolean) => releasePermission({ granted: g }) };
});

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
  registerPlugin: () => h.plugin,
}));
vi.mock("@/lib/permissions", () => ({
  checkActivityState: async () => ({ status: "granted" }),
  checkBatteryState: async () => ({ status: "granted" }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    upsert: async () => ({ error: null }),
    update: () => q,
    eq: () => q,
    select: () => q,
    insert: async () => ({ error: null }),
    maybeSingle: async () => ({ data: null }),
    then: undefined,
  });
  return { supabase: { from: () => q, functions: { invoke: async () => ({}) }, auth: { getSession: async () => ({ data: { session: null } }) } } };
});

import { startMovementMonitoring, stopMovementMonitoring } from "@/lib/stepMonitoring";

beforeEach(() => vi.clearAllMocks());

describe("movement checks stop for good", () => {
  it("a stop while the permission prompt is open prevents tracking from starting later", async () => {
    const start = startMovementMonitoring("b1", "w1");
    await new Promise((r) => setTimeout(r, 0));
    await stopMovementMonitoring(); // booking ended / reassigned / logout
    h.release(true); // permission answered afterwards
    await start;
    expect(h.plugin.startMonitoring).not.toHaveBeenCalled();
    expect(h.plugin.addListener).not.toHaveBeenCalled();
  });
});
