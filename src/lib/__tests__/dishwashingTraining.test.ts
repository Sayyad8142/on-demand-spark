import { describe, expect, it } from "vitest";
import { DISHWASHING_SLIDE_MS, DISHWASHING_TRAINING_STEPS, nextSlide, swipeTarget, trainingSlides } from "@/lib/dishwashingTraining";

describe("dishwashing training slideshow", () => {
  it("keeps the requested five-step order", () => {
    expect(DISHWASHING_TRAINING_STEPS).toEqual(["before_washing", "washing_dishes", "arrange_dishes", "clean_granite", "clean_floor"]);
  });
  it("changes every 3 seconds", () => {
    expect(DISHWASHING_SLIDE_MS).toBe(3000);
  });
  it("shows nothing extra until real photos exist, and keeps order regardless of insertion", () => {
    expect(trainingSlides({})).toEqual([]);
    expect(trainingSlides({ clean_floor: "f.webp", before_washing: "b.webp" }).map((s) => s.step)).toEqual(["before_washing", "clean_floor"]);
  });
  it("loops from the last photo back to the first", () => {
    expect(nextSlide(4, 5)).toBe(0);
  });
  it("swipes left forward, right back, ignores small moves", () => {
    expect(swipeTarget(0, 5, -80)).toBe(1);
    expect(swipeTarget(0, 5, 80)).toBe(4);
    expect(swipeTarget(2, 5, 10)).toBe(2);
  });
});

import { DISHWASHING_TRAINING_PHOTOS as BUNDLED } from "../dishwashingTraining";
describe("bundled dishwashing photos", () => {
  it("has all five steps in order", () => {
    expect(trainingSlides(BUNDLED).map((s) => s.step)).toEqual(["before_washing", "washing_dishes", "arrange_dishes", "clean_granite", "clean_floor"]);
  });
});
