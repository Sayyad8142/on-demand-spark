import { beforeEach, describe, expect, it, vi } from "vitest";
const bridge = vi.hoisted(() => ({ platform: "android", open: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => bridge.platform }, registerPlugin: () => ({ open: bridge.open }) }));
import { openWorkerStore } from "../workerStore";

describe("Worker Store opening", () => {
  beforeEach(() => { bridge.platform = "android"; bridge.open.mockReset(); });
  it("opens the native bridge on the first tap, not a browser", async () => {
    bridge.open.mockResolvedValue({ destination: "play" });
    const browser = vi.spyOn(window, "open").mockImplementation(() => null);
    await openWorkerStore();
    expect(bridge.open).toHaveBeenCalledOnce();
    expect(browser).not.toHaveBeenCalled();
    browser.mockRestore();
  });
  it("coalesces double taps while the native action is pending", async () => {
    let finish: (() => void) | undefined;
    bridge.open.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const first = openWorkerStore();
    const second = openWorkerStore();
    expect(second).toBe(first);
    expect(bridge.open).toHaveBeenCalledOnce();
    finish?.();
    await first;
  });
  it("bridge errors do not silently open Chrome and can be retried", async () => {
    bridge.open.mockRejectedValueOnce(new Error("bridge unavailable")).mockResolvedValueOnce({ destination: "play" });
    const browser = vi.spyOn(window, "open").mockImplementation(() => null);
    await expect(openWorkerStore()).rejects.toThrow("bridge unavailable");
    expect(browser).not.toHaveBeenCalled();
    await openWorkerStore();
    expect(bridge.open).toHaveBeenCalledTimes(2);
    browser.mockRestore();
  });
  it("web opens only the official Worker listing", async () => {
    bridge.platform = "web";
    const browser = vi.spyOn(window, "open").mockImplementation(() => null);
    await openWorkerStore();
    expect(browser).toHaveBeenCalledWith("https://play.google.com/store/apps/details?id=app.didisnow.worker", "_blank", "noopener,noreferrer");
    expect(bridge.open).not.toHaveBeenCalled();
    browser.mockRestore();
  });
});