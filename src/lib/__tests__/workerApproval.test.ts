import { describe, it, expect } from "vitest";
import { approvalState, workerApproved } from "../workerApproval";

describe("worker approval gate", () => {
  it("new signup pending approval cannot go online", () => {
    expect(workerApproved({ approval_status: "pending_approval", availability_requires_approval: true })).toBe(false);
  });
  it("missing data is treated as pending", () => {
    expect(workerApproved(null)).toBe(false);
    expect(workerApproved({})).toBe(false);
  });
  it("approved worker can go online", () => {
    expect(workerApproved({ approval_status: "approved", availability_requires_approval: true })).toBe(true);
  });
  it("existing worker awaiting Admin review keeps working under the legacy exemption", () => {
    const w = { approval_status: "pending_approval", availability_requires_approval: false };
    expect(approvalState(w)).toBe("legacy_pending_review");
    expect(workerApproved(w)).toBe(true);
  });
  it("rejected or suspended workers are locked even with the legacy exemption", () => {
    expect(workerApproved({ approval_status: "rejected", availability_requires_approval: false })).toBe(false);
    expect(workerApproved({ approval_status: "suspended", availability_requires_approval: false })).toBe(false);
  });
});
