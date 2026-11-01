import { describe, it, expect } from "vitest";
import { isValidSlot, hasValidSlots, countValidSlots, canTurnOn, canSaveSelection, shouldRedirectToSetup } from "../availabilityGate";

const junkRow = { slots: Array(26).fill("false") };

describe("valid slots", () => {
  it("placeholder 'false' slots from old signup seeding do not count", () => {
    expect(hasValidSlots([junkRow, junkRow])).toBe(false);
  });
  it("a new worker with no rows has zero slots", () => {
    expect(hasValidSlots([])).toBe(false);
    expect(hasValidSlots(null)).toBe(false);
  });
  it("empty day rows have zero slots", () => {
    expect(hasValidSlots([{ slots: [] }, { slots: null }])).toBe(false);
  });
  it("one real saved slot counts", () => {
    expect(hasValidSlots([{ slots: [] }, { slots: ["09:30:00"] }])).toBe(true);
  });
  it("only the 07:00–18:30 half-hour grid is valid", () => {
    expect(isValidSlot("07:00:00")).toBe(true);
    expect(isValidSlot("18:30")).toBe(true);
    expect(isValidSlot("06:30:00")).toBe(false);
    expect(isValidSlot("19:00:00")).toBe(false);
    expect(isValidSlot("09:15:00")).toBe(false);
    expect(isValidSlot(true)).toBe(false);
  });
  it("counts real slots and ignores junk mixed in", () => {
    expect(countValidSlots([{ slots: ["false", "08:00:00", "08:30:00"] }])).toBe(2);
  });
});

describe("going ON", () => {
  it("cannot switch ON with zero saved slots", () => {
    expect(canTurnOn(true, [junkRow])).toBe(false);
  });
  it("can switch ON with a saved slot", () => {
    expect(canTurnOn(true, [{ slots: ["10:00:00"] }])).toBe(true);
  });
  it("switching OFF is always allowed", () => {
    expect(canTurnOn(false, [])).toBe(true);
  });
});

describe("saving", () => {
  it("empty selection cannot be saved", () => {
    expect(canSaveSelection(0)).toBe(false);
  });
  it("one selected slot can be saved", () => {
    expect(canSaveSelection(1)).toBe(true);
  });
});

describe("setup redirect", () => {
  it("zero slots on Home redirects once", () => {
    expect(shouldRedirectToSetup({ hasSlots: false, pathname: "/home", alreadyRedirected: false })).toBe(true);
    expect(shouldRedirectToSetup({ hasSlots: false, pathname: "/home", alreadyRedirected: true })).toBe(false);
  });
  it("workers with saved slots are not redirected", () => {
    expect(shouldRedirectToSetup({ hasSlots: true, pathname: "/home", alreadyRedirected: false })).toBe(false);
  });
  it("unknown slot state (loading or read error) never redirects", () => {
    expect(shouldRedirectToSetup({ hasSlots: null, pathname: "/home", alreadyRedirected: false })).toBe(false);
  });
  it("never redirects from availability, profile or support", () => {
    for (const p of ["/availability", "/profile", "/support"]) {
      expect(shouldRedirectToSetup({ hasSlots: false, pathname: p, alreadyRedirected: false })).toBe(false);
    }
  });
  it("guests are never redirected", () => {
    expect(shouldRedirectToSetup({ hasSlots: false, pathname: "/home", alreadyRedirected: false, isGuest: true })).toBe(false);
  });
});
