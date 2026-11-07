import { describe, it, expect } from "vitest";
import { evaluatePushHealth } from "@/lib/pushHealth";

const base = { permissionGranted: true, phoneToken: "tok-A", backendToken: "tok-A", backendStatus: "active" };

describe("notification health", () => {
  it("same token on phone and server → healthy", () => {
    const r = evaluatePushHealth(base);
    expect(r.isHealthy).toBe(true);
    expect(r.tokenMismatch).toBe(false);
  });

  it("phone and server tokens differ → NOT healthy (mismatch)", () => {
    const r = evaluatePushHealth({ ...base, backendToken: "tok-OLD" });
    expect(r.tokenMismatch).toBe(true);
    expect(r.tokenSyncedToBackend).toBe(false);
    expect(r.isHealthy).toBe(false);
  });

  it("notifications permission missing → NOT healthy", () => {
    expect(evaluatePushHealth({ ...base, permissionGranted: false }).isHealthy).toBe(false);
  });

  it("server has no token (registration failed) → NOT healthy", () => {
    const r = evaluatePushHealth({ ...base, backendToken: null });
    expect(r.tokenSyncedToBackend).toBe(false);
    expect(r.isHealthy).toBe(false);
  });

  it("server marked the token invalid → NOT healthy", () => {
    expect(evaluatePushHealth({ ...base, backendStatus: "invalid" }).isHealthy).toBe(false);
  });

  it("phone token unknown (older build) → judged on the server token only", () => {
    expect(evaluatePushHealth({ ...base, phoneToken: null }).isHealthy).toBe(true);
  });
});
