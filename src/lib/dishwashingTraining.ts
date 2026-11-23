import beforeWashing from "@/assets/dishwashing-training/before_washing.webp";
import washingDishes from "@/assets/dishwashing-training/washing_dishes.webp";
import arrangeDishes from "@/assets/dishwashing-training/arrange_dishes.webp";
import cleanGranite from "@/assets/dishwashing-training/clean_granite.webp";
import cleanFloor from "@/assets/dishwashing-training/clean_floor.webp";

/**
 * Dishwashing training slideshow (display-only).
 * Steps are shown in this exact order. A step appears only when it has a photo
 * in `DISHWASHING_TRAINING_PHOTOS`; with none the booking card keeps the
 * existing Dish Washing image. Current photos are owner-approved generated
 * pictures (owner had no real photos); replace a file to swap one.
 */
export const DISHWASHING_TRAINING_STEPS = [
  "before_washing",
  "washing_dishes",
  "arrange_dishes",
  "clean_granite",
  "clean_floor",
] as const;

export type DishwashingStep = (typeof DISHWASHING_TRAINING_STEPS)[number];

export const DISHWASHING_STEP_LABELS: Record<DishwashingStep, string> = {
  before_washing: "Before Washing",
  washing_dishes: "Washing Dishes",
  arrange_dishes: "Arrange Dishes",
  clean_granite: "Clean Granite",
  clean_floor: "Clean Floor",
};

/** One photo per step, keyed by its step. */
export const DISHWASHING_TRAINING_PHOTOS: Partial<Record<DishwashingStep, string>> = {
  before_washing: beforeWashing,
  washing_dishes: washingDishes,
  arrange_dishes: arrangeDishes,
  clean_granite: cleanGranite,
  clean_floor: cleanFloor,
};

export const DISHWASHING_SLIDE_MS = 3000;

export function trainingSlides(photos: Partial<Record<DishwashingStep, string>>) {
  return DISHWASHING_TRAINING_STEPS.flatMap((step) =>
    photos[step] ? [{ step, label: DISHWASHING_STEP_LABELS[step], src: photos[step] as string }] : [],
  );
}

export function nextSlide(index: number, count: number): number {
  return count > 0 ? (index + 1) % count : 0;
}

/** Swipe left (negative dx) goes forward, right goes back; small moves are ignored. */
export function swipeTarget(index: number, count: number, dx: number, threshold = 40): number {
  if (count <= 1 || Math.abs(dx) < threshold) return index;
  return dx < 0 ? (index + 1) % count : (index - 1 + count) % count;
}
