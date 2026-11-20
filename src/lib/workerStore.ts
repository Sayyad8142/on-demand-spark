import { Capacitor, registerPlugin } from "@capacitor/core";
import { WORKER_PLAY_STORE_URL } from "@/lib/updateDecision";

const WorkerStore = registerPlugin<{ open(): Promise<{ destination: "play" | "browser" }> }>("WorkerStore");
let opening: Promise<void> | null = null;

/** Native owns fallback; a bridge failure must not silently send Android to Chrome. */
export function openWorkerStore(): Promise<void> {
  if (opening) return opening;
  opening = (async () => {
    if (Capacitor.getPlatform() === "android") {
      await WorkerStore.open();
    } else {
      const popup = window.open(WORKER_PLAY_STORE_URL, "_blank", "noopener,noreferrer");
      // noopener windows can return null even when opened; never claim an update.
      void popup;
    }
  })().finally(() => { opening = null; });
  return opening;
}