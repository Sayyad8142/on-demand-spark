import { Capacitor, registerPlugin } from "@capacitor/core";
import { parsePassbookText, type PassbookFields } from "./passbookText";

export type PassbookSource = "camera" | "gallery";
const nativeScanner = registerPlugin<{ scan(options: { source: PassbookSource }): Promise<{ text: string }> }>("PassbookScanner");
export const hasNativePassbookScanner = () => Capacitor.getPlatform() === "android";

/** Images never go to Supabase/OCR APIs; only reviewed form values are submitted. */
export async function scanPassbook(source: PassbookSource, file?: File, signal?: AbortSignal): Promise<PassbookFields> {
  if (hasNativePassbookScanner()) {
    const result = await nativeScanner.scan({ source });
    if (signal?.aborted) throw new Error("cancelled");
    return parsePassbookText(result.text);
  }
  if (!file || !file.type.startsWith("image/") || file.size > 12 * 1024 * 1024) throw new Error("invalid_image");
  // Lazy load only after a worker chooses a picture. Model downloads contain no bank data.
  const { createWorker } = await import("tesseract.js");
  if (signal?.aborted) throw new Error("cancelled");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); throw new Error("unavailable"); }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  const cancel = () => { if (worker) void worker.terminate(); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    worker = await createWorker("eng", 1, { cacheMethod: "none", logger: () => {}, errorHandler: () => {} });
    if (signal?.aborted) throw new Error("cancelled");
    const { data } = await worker.recognize(canvas);
    if (signal?.aborted) throw new Error("cancelled");
    return parsePassbookText(data.text);
  } finally {
    signal?.removeEventListener("abort", cancel);
    if (worker) await worker.terminate().catch(() => {});
    canvas.width = 0; canvas.height = 0;
  }
}