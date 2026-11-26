import { describe, it, expect } from "vitest";
import { heartbeatAppState } from "@/lib/heartbeatAppState";

describe("heartbeatAppState", () => {
  it("sends foreground for app open while visible", () => {
    expect(heartbeatAppState("open", true)).toBe("foreground");
  });
  it("sends foreground for interval and post-boot checks while visible", () => {
    expect(heartbeatAppState("interval", true)).toBe("foreground");
    expect(heartbeatAppState("post_boot_verify", true)).toBe("foreground");
  });
  it("sends background when the page is hidden", () => {
    expect(heartbeatAppState("interval", false)).toBe("background");
  });
  it("never sends the raw reason", () => {
    for (const r of ["open", "login", "interval", "post_boot_verify", "foreground"]) {
      expect(["foreground", "background"]).toContain(heartbeatAppState(r, true));
    }
  });
});
