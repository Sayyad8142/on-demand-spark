import { useEffect, useState } from "react";
import { formatFromPictureSize, youtubeShapePictureUrl } from "@/lib/trainingVideo";

const PROBE_TIMEOUT_MS = 3000;
const cache = new Map<string, "shorts" | "landscape">();

/**
 * Display-only: decides portrait vs landscape for the Home video.
 * An explicit Shorts link is trusted; otherwise YouTube's picture shape decides.
 * Failure or timeout keeps landscape (never crops). Returns null while checking.
 */
export function useYoutubeFormat(videoId: string, format: "shorts" | "landscape"): "shorts" | "landscape" | null {
  const known = format === "shorts" ? "shorts" : cache.get(videoId) ?? null;
  const [result, setResult] = useState<{ id: string; format: "shorts" | "landscape" } | null>(null);

  useEffect(() => {
    if (known) return;
    let done = false;
    const finish = (f: "shorts" | "landscape", remember: boolean) => {
      if (done) return;
      done = true;
      if (remember) cache.set(videoId, f);
      setResult({ id: videoId, format: f });
    };
    const img = new Image();
    img.onload = () => finish(formatFromPictureSize(img.naturalWidth, img.naturalHeight), true);
    img.onerror = () => finish("landscape", false);
    img.src = youtubeShapePictureUrl(videoId);
    const t = setTimeout(() => finish("landscape", false), PROBE_TIMEOUT_MS);
    return () => { done = true; clearTimeout(t); img.onload = null; img.onerror = null; };
  }, [videoId, known]);

  if (known) return known;
  return result?.id === videoId ? result.format : null;
}
