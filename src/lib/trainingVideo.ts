/**
 * Home training video — pure, display-only rules.
 * Never touches bookings, availability, dispatch, OTP or payments.
 */

/** Master client switch. Keep false until the Admin Panel backend is live and integration tests pass. */
export const TRAINING_VIDEO_CLIENT_ENABLED = true;

export const TRAINING_VIDEO_TABLE = "worker_training_video_settings";
export const TRAINING_VIDEO_REFRESH_MS = 5 * 60 * 1000;

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function isValidYoutubeId(id: unknown): id is string {
  return typeof id === "string" && YT_ID.test(id);
}

export interface TrainingVideoConfig {
  enabled: boolean;
  videoId: string;
  format?: "shorts" | "landscape";
}

/**
 * An explicit official Shorts link proves portrait format. IDs and other links return
 * "landscape" here; the player then checks YouTube's own picture shape (see
 * `formatFromPictureSize`) before choosing portrait.
 */
export function parseYoutubeVideo(value: unknown): { videoId: string; format: "shorts" | "landscape" } | null {
  if (isValidYoutubeId(value)) return { videoId: value, format: "landscape" };
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    let videoId: string | null = null;
    let format: "shorts" | "landscape" = "landscape";
    if (host === "youtu.be") {
      videoId = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? null;
    } else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
      const shorts = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/);
      if (shorts) { videoId = shorts[1]; format = "shorts"; }
      else if (url.pathname === "/watch") videoId = url.searchParams.get("v");
      else videoId = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})\/?$/)?.[1] ?? null;
    }
    return isValidYoutubeId(videoId) ? { videoId, format } : null;
  } catch { return null; }
}

/** YouTube's full-frame picture for a video; its shape matches the real video (portrait for Shorts). */
export function youtubeShapePictureUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/oar2.jpg`;
}

/** Clearly taller than wide → Shorts; anything else, unknown or broken → landscape. */
export function formatFromPictureSize(width: unknown, height: unknown): "shorts" | "landscape" {
  if (typeof width !== "number" || typeof height !== "number") return "landscape";
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "landscape";
  return height > width * 1.2 ? "shorts" : "landscape";
}

/** Parse a raw settings row. Anything malformed → null (hidden). */
export function parseTrainingVideoRow(row: unknown): TrainingVideoConfig | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (r.enabled !== true) return null;
  const video = parseYoutubeVideo(r.youtube_video_id);
  if (!video) return null;
  return { enabled: true, ...video };
}

export interface VisibilityInput {
  clientEnabled: boolean;
  config: TrainingVideoConfig | null;
  isGuest: boolean;
  hasActiveJob: boolean;
  offerVisible: boolean;
  appForeground: boolean;
  playerError: boolean;
}

/** Bookings always win: any booking activity, error or doubt hides the video. */
export function shouldShowTrainingVideo(i: VisibilityInput): boolean {
  return (
    i.clientEnabled &&
    !!i.config &&
    i.config.enabled &&
    isValidYoutubeId(i.config.videoId) &&
    !i.isGuest &&
    !i.hasActiveJob &&
    !i.offerVisible &&
    i.appForeground &&
    !i.playerError
  );
}

/** Embed URL using official YouTube player params. Muted autoplay is the only reliable autoplay. */
export function buildEmbedUrl(videoId: string, origin: string): string {
  const p = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    playsinline: "1",
    controls: "1",
    fs: "1",
    rel: "0",
    modestbranding: "1",
    enablejsapi: "1",
    origin,
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${p.toString()}`;
}
