/** In-memory image clean-up for local OCR. Pure pixel maths: nothing is stored or sent anywhere. */
export interface Gray { data: Uint8ClampedArray; width: number; height: number }

export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; j < data.length; i += 4, j++) {
    // Red channel weighted up: blue/cyan security patterns turn light, black print stays dark.
    data[j] = Math.min(255, rgba[i] * 0.6 + rgba[i + 1] * 0.3 + rgba[i + 2] * 0.1);
  }
  return { data, width, height };
}

export function otsu(data: Uint8ClampedArray): number {
  const hist = new Array(256).fill(0);
  for (const v of data) hist[v]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = data.length - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

/** Bright document on a darker background → its bounding box; null when no clear page edge. */
export function documentBounds(img: Gray): { x: number; y: number; width: number; height: number } | null {
  const { data, width, height } = img;
  const t = otsu(data);
  const rowFill = (y: number) => { let n = 0; for (let x = 0; x < width; x++) if (data[y * width + x] > t) n++; return n / width; };
  const colFill = (x: number, y0: number, y1: number) => { let n = 0; for (let y = y0; y < y1; y++) if (data[y * width + x] > t) n++; return n / Math.max(1, y1 - y0); };
  let top = 0, bottom = height - 1;
  while (top < height && rowFill(top) < 0.45) top++;
  while (bottom > top && rowFill(bottom) < 0.45) bottom--;
  if (bottom - top < height * 0.2) return null;
  let left = 0, right = width - 1;
  while (left < width && colFill(left, top, bottom) < 0.6) left++;
  while (right > left && colFill(right, top, bottom) < 0.6) right--;
  const w = right - left, h = bottom - top;
  if (w < width * 0.3 || w * h < width * height * 0.15) return null;
  if (w * h > width * height * 0.95) return null; // already fills the photo
  const mx = Math.round(w * 0.02), my = Math.round(h * 0.02);
  const x = Math.max(0, left - mx), y = Math.max(0, top - my);
  return { x, y, width: Math.min(width - x, w + 2 * mx), height: Math.min(height - y, h + 2 * my) };
}

export function crop(img: Gray, b: { x: number; y: number; width: number; height: number }): Gray {
  const data = new Uint8ClampedArray(b.width * b.height);
  for (let y = 0; y < b.height; y++) data.set(img.data.subarray((b.y + y) * img.width + b.x, (b.y + y) * img.width + b.x + b.width), y * b.width);
  return { data, width: b.width, height: b.height };
}

/** Stretch the 2nd–98th percentile to full range. */
export function stretchContrast(img: Gray): Gray {
  const hist = new Array(256).fill(0);
  for (const v of img.data) hist[v]++;
  const n = img.data.length; let acc = 0, lo = 0, hi = 255;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.02) { lo = i; break; } }
  acc = 0; for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= n * 0.02) { hi = i; break; } }
  const range = Math.max(1, hi - lo);
  const data = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) data[i] = ((img.data[i] - lo) * 255) / range;
  return { ...img, data };
}

/** 3x3 unsharp mask. */
export function sharpen(img: Gray): Gray {
  const { width: w, height: h, data: s } = img;
  const data = new Uint8ClampedArray(s);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    data[i] = 5 * s[i] - s[i - 1] - s[i + 1] - s[i - w] - s[i + w];
  }
  return { ...img, data };
}

/** Local mean threshold (integral image): removes patterned backgrounds, keeps dark print. */
export function binarize(img: Gray, radius = 15, offset = 18): Gray {
  const { width: w, height: h, data: s } = img;
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += s[y * w + x]; integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row; }
  }
  const data = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1), y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
    const sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
    const mean = sum / ((x1 - x0) * (y1 - y0));
    data[y * w + x] = s[y * w + x] < mean - offset ? 0 : 255;
  }
  return { ...img, data };
}

export function rotate90(img: Gray, clockwise: boolean): Gray {
  const { width: w, height: h, data: s } = img;
  const data = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = clockwise ? h - 1 - y : y, ny = clockwise ? x : w - 1 - x;
    data[ny * h + nx] = s[y * w + x];
  }
  return { data, width: h, height: w };
}

export interface OcrWord { text: string; x0: number; x1: number }
/** Joins a recognised line, starting a new line at wide gaps so separate printed items never merge. */
export function splitWideGaps(words: OcrWord[], lineHeight: number): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let lastX1 = -Infinity;
  for (const word of [...words].sort((a, b) => a.x0 - b.x0)) {
    if (!word.text.trim()) continue;
    if (current.length && word.x0 - lastX1 > Math.max(lineHeight * 1.6, 12)) { out.push(current.join(" ")); current = []; }
    current.push(word.text.trim()); lastX1 = word.x1;
  }
  if (current.length) out.push(current.join(" "));
  return out;
}
