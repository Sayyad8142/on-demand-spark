import { it, expect } from "vitest";
import { batteryCanContinue, shouldOfferActivitySetup } from "../setupGate";
it("activity is optional and offered once only in setup", () => {
  expect(shouldOfferActivitySetup("missing", false)).toBe(true);
  expect(shouldOfferActivitySetup("missing", true)).toBe(false);
  expect(shouldOfferActivitySetup("granted", false)).toBe(false);
  expect(shouldOfferActivitySetup("not_required", false)).toBe(false);
});
it("safe battery continuation requires a failed/denied settings attempt, never a fake grant", () => {
  expect(batteryCanContinue("missing", false)).toBe(false);
  expect(batteryCanContinue("missing", true)).toBe(true);
  expect(batteryCanContinue("unknown", true)).toBe(true);
  expect(batteryCanContinue("granted", true)).toBe(false);
});