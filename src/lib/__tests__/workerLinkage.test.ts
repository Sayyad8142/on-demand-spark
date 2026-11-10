import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { isAccountRecoveryRequired, isIdentityLocked, signupMayUpdateExisting, ACCOUNT_RECOVERY_MESSAGE } from "../workerLinkage";
import en from "@/i18n/locales/en.json";
import hi from "@/i18n/locales/hi.json";
import te from "@/i18n/locales/te.json";

const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", "..", p), "utf8");

describe("worker account linkage (app side)", () => {
  it("reused phone: sign-up never overwrites a worker owned by another login", () => {
    expect(signupMayUpdateExisting({ id: "A", user_id: "A" }, "B")).toBe(false);
  });
  it("legit returning worker may update own row", () => {
    expect(signupMayUpdateExisting({ id: "A", user_id: "A" }, "A")).toBe(true);
    expect(signupMayUpdateExisting({ id: "A", user_id: null }, "A")).toBe(true);
    expect(signupMayUpdateExisting(null, "A")).toBe(false);
  });
  it("recognises the server's recovery and identity-lock answers only", () => {
    expect(isAccountRecoveryRequired({ code: "ACCOUNT_RECOVERY_REQUIRED" })).toBe(true);
    expect(isAccountRecoveryRequired({ code: "WORKER_NOT_FOUND" })).toBe(false);
    expect(isAccountRecoveryRequired(null)).toBe(false);
    expect(isIdentityLocked({ message: "WORKER_IDENTITY_LOCKED: phone" })).toBe(true);
    expect(isIdentityLocked({ message: "permission denied" })).toBe(false);
  });
  it("sign-in no longer re-points workers.id by phone", () => {
    const src = read("pages/OtpVerify.tsx");
    expect(src).not.toMatch(/update\(\{\s*id:\s*data\.user\.id\s*\}\)/);
  });
  it("profile self-link only when the row id is this login", () => {
    expect(read("hooks/useWorkerProfile.ts")).toMatch(/!data\.user_id && data\.id === userId/);
  });
  it("app never writes id/user_id/phone in plain updates", () => {
    const files = ["pages/Profile.tsx", "contexts/AuthContext.tsx", "lib/pushToken.ts", "components/UpiQrUpload.tsx", "hooks/useFCMTokenSync.ts"];
    for (const f of files) expect(read(f)).not.toMatch(/from\(['"]workers['"]\)\s*\.update\(\{[^}]*\b(phone|user_id|id)\s*:/s);
  });
  it("recovery message exists in en/hi/te", () => {
    const k = ACCOUNT_RECOVERY_MESSAGE.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
    for (const l of [en, hi, te]) expect((l as { worker: Record<string, string> }).worker[k]).toBeTruthy();
  });
});
