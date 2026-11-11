/**
 * Latest known WorkState for code outside React (OTA check, Settings).
 * Written only by AppInner; starts as "not loaded" so anything reading it before
 * the first booking lookup treats the worker as busy.
 */
import type { WorkState } from "@/lib/workSafety";

let current: WorkState = { bookingLoaded: false };
export function setWorkState(s: WorkState): void { current = { ...s }; }
export function getWorkState(): WorkState { return current; }
