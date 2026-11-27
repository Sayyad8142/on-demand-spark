import { Capacitor, registerPlugin } from "@capacitor/core";
import { countPassbookFields, mergePassbookReadings, parsePassbookText, PASSBOOK_FIELD_COUNT, type PassbookFields } from "./passbookText";
import { binarize, crop, documentBounds, rotate90, sharpen, splitWideGaps, stretchContrast, toGray, type Gray } from "./passbookImage";

export type PassbookSource = "camera" | "gallery";
const nativeScanner = registerPlugin<{ scan(options: { source: PassbookSource }): Promise<{ text: string; texts?: string[] }> }>("PassbookScanner");
export const hasNativePassbookScanner = () => Capacitor.getPlatform() === "android";

/** Parses every native reading separately and keeps only values the readings agree on. */
export function fieldsFromReadings(texts: string[]): PassbookFields {
  const readings = texts.filter((t) => typeof t === "string" && t.trim()).map(parsePassbookText);
  return mergePassbookReadings(readings);
}

type TesseractLine = { text: string; bbox: { y0: number; y1: number }; words?: Array<{ text: string; bbox: { x0: number; x1: number } }> };
type TesseractData = { text: string; blocks?: Array<{ paragraphs?: Array<{ lines?: TesseractLine[] }> }> | null };

/** Rebuilds Tesseract output line by line, splitting at wide gaps (e.g. pattern noise beside a name). */
export function textFromTesseract(data: TesseractData): string {
  const lines = data.blocks?.flatMap((b) => b.paragraphs?.flatMap((p) => p.lines ?? []) ?? []) ?? [];
  if (!lines.length) return data.text || "";
  return lines.flatMap((line) => line.words?.length
    ? splitWideGaps(line.words.map((w) => ({ text: w.text, x0: w.bbox.x0, x1: w.bbox.x1 })), line.bbox.y1 - line.bbox.y0)
    : [line.text.trim()]).join("\n");
}

function toCanvas(img: Gray): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("unavailable");
  const rgba = new ImageData(img.width, img.height);
  for (let i = 0, j = 0; j < img.data.length; i += 4, j++) { rgba.data[i] = rgba.data[i + 1] = rgba.data[i + 2] = img.data[j]; rgba.data[i + 3] = 255; }
  ctx.putImageData(rgba, 0, 0);
  return canvas;
}

/** Images never go to Supabase/OCR APIs; only reviewed form values are submitted. */
export async function scanPassbook(source: PassbookSource, file?: File, signal?: AbortSignal): Promise<PassbookFields> {
  if (hasNativePassbookScanner()) {
    const result = await nativeScanner.scan({ source });
    if (signal?.aborted) throw new Error("cancelled");
    return fieldsFromReadings(Array.isArray(result.texts) && result.texts.length ? result.texts : [result.text]);
  }
  if (!file || !file.type.startsWith("image/") || file.size > 12 * 1024 * 1024) throw new Error("invalid_image");
  // Lazy load only after a worker chooses a picture. Model downloads contain no bank data.
  const { createWorker } = await import("tesseract.js");
  if (signal?.aborted) throw new Error("cancelled");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  // Small photos are enlarged (up to 2x) so thin print stays readable; large ones are reduced.
  const longSide = Math.max(bitmap.width, bitmap.height);
  const scale = longSide < 1400 ? Math.min(2, 2000 / longSide) : Math.min(1, 2400 / longSide);
  const source2d = document.createElement("canvas");
  source2d.width = Math.max(1, Math.round(bitmap.width * scale));
  source2d.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = source2d.getContext("2d", { willReadFrequently: true });
  if (!ctx) { bitmap.close(); throw new Error("unavailable"); }
  ctx.drawImage(bitmap, 0, 0, source2d.width, source2d.height);
  bitmap.close();
  let gray = toGray(ctx.getImageData(0, 0, source2d.width, source2d.height).data, source2d.width, source2d.height);
  source2d.width = 0; source2d.height = 0;
  const bounds = documentBounds(gray);
  if (bounds) gray = crop(gray, bounds);
  const enhanced = sharpen(stretchContrast(gray));

  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  const cancel = () => { if (worker) void worker.terminate(); };
  signal?.addEventListener("abort", cancel, { once: true });
  const canvases: HTMLCanvasElement[] = [];
  try {
    worker = await createWorker("eng", 1, { cacheMethod: "none", logger: () => {}, errorHandler: () => {} });
    const read = async (img: Gray) => {
      if (signal?.aborted) throw new Error("cancelled");
      const canvas = toCanvas(img); canvases.push(canvas);
      const { data } = await worker!.recognize(canvas, {}, { text: true, blocks: true });
      if (signal?.aborted) throw new Error("cancelled");
      return { fields: parsePassbookText(textFromTesseract(data as TesseractData)), confidence: Number(data.confidence) || 0 };
    };
    // A portrait photo may be a sideways cheque: keep the orientation that reads best.
    const turns = gray.height > gray.width ? [0, 1, -1] : [0];
    let best = { turn: 0, fields: { holder: "", account: "", ifsc: "", bankName: "" } as PassbookFields, score: -1 };
    for (const turn of turns) {
      const result = await read(turn ? rotate90(gray, turn > 0) : gray);
      const score = countPassbookFields(result.fields) * 100 + result.confidence;
      if (score > best.score) best = { turn, fields: result.fields, score };
      if (countPassbookFields(result.fields) === PASSBOOK_FIELD_COUNT) break;
    }
    const orient = (img: Gray) => (best.turn ? rotate90(img, best.turn > 0) : img);
    // Up to three clean-ups of the same photo; a field keeps the value most passes agree on.
    const readings = [best.fields];
    const merged = () => mergePassbookReadings(readings);
    if (countPassbookFields(merged()) < PASSBOOK_FIELD_COUNT) readings.push((await read(orient(enhanced))).fields);
    if (countPassbookFields(merged()) < PASSBOOK_FIELD_COUNT) readings.push((await read(orient(binarize(enhanced)))).fields);
    return merged();
  } finally {
    signal?.removeEventListener("abort", cancel);
    if (worker) await worker.terminate().catch(() => {});
    for (const canvas of canvases) { canvas.width = 0; canvas.height = 0; }
  }
}
