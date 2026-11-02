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
}

/** Parse a raw settings row. Anything malformed → null (hidden). */
export function parseTrainingVideoRow(row: unknown): TrainingVideoConfig | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (r.enabled !== true) return null;
  if (!isValidYoutubeId(r.youtube_video_id)) return null;
  return { enabled: true, videoId: r.youtube_video_id };
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
    rel: "0",
    modestbranding: "1",
    enablejsapi: "1",
    origin,
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${p.toString()}`;
}
