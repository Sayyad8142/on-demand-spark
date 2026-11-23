/**
 * Dishwashing training slideshow (display-only).
 * Steps are shown in this exact order. A step appears only once its real
 * training photo has been added to `DISHWASHING_TRAINING_PHOTOS`; until then
 * the booking card keeps the existing Dish Washing image. Never substitute
 * stock pictures here.
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

/** Add each owner-supplied photo import here, keyed by its step. */
export const DISHWASHING_TRAINING_PHOTOS: Partial<Record<DishwashingStep, string>> = {};

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
