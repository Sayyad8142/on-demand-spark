import { describe, it, expect } from "vitest";
import {
  TRAINING_VIDEO_CLIENT_ENABLED, isValidYoutubeId, parseTrainingVideoRow,
  shouldShowTrainingVideo, buildEmbedUrl, TRAINING_VIDEO_REFRESH_MS, type VisibilityInput,
} from "../trainingVideo";

const ok: VisibilityInput = {
  clientEnabled: true, config: { enabled: true, videoId: "dQw4w9WgXcQ" },
  isGuest: false, hasActiveJob: false, offerVisible: false, appForeground: true, playerError: false,
};

describe("training video rules", () => {
  it("ships disabled until backend integration passes", () => expect(TRAINING_VIDEO_CLIENT_ENABLED).toBe(false));
  it("admin OFF → hidden", () => expect(parseTrainingVideoRow({ enabled: false, youtube_video_id: "dQw4w9WgXcQ" })).toBeNull());
  it("admin ON with valid id → shown", () => {
    const c = parseTrainingVideoRow({ enabled: true, youtube_video_id: "dQw4w9WgXcQ" });
    expect(shouldShowTrainingVideo({ ...ok, config: c })).toBe(true);
  });
  it("new id is used", () => expect(parseTrainingVideoRow({ enabled: true, youtube_video_id: "abcdefghijk" })?.videoId).toBe("abcdefghijk"));
  it("invalid / missing ids or rows → hidden", () => {
    for (const id of ["", "short", "https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ<x", null, 5]) {
      expect(parseTrainingVideoRow({ enabled: true, youtube_video_id: id })).toBeNull();
    }
    expect(parseTrainingVideoRow(null)).toBeNull();
    expect(parseTrainingVideoRow({ enabled: "true", youtube_video_id: "dQw4w9WgXcQ" })).toBeNull();
    expect(isValidYoutubeId("dQw4w9WgXcQ")).toBe(true);
  });
  it("config unavailable → hidden", () => expect(shouldShowTrainingVideo({ ...ok, config: null })).toBe(false));
  it("client switch off → hidden", () => expect(shouldShowTrainingVideo({ ...ok, clientEnabled: false })).toBe(false));
  it("booking offer → hidden", () => expect(shouldShowTrainingVideo({ ...ok, offerVisible: true })).toBe(false));
  it("active booking → hidden", () => expect(shouldShowTrainingVideo({ ...ok, hasActiveJob: true })).toBe(false));
  it("booking finished (no active job, no offer) → can return", () => expect(shouldShowTrainingVideo(ok)).toBe(true));
  it("background → hidden", () => expect(shouldShowTrainingVideo({ ...ok, appForeground: false })).toBe(false));
  it("player error → hidden", () => expect(shouldShowTrainingVideo({ ...ok, playerError: true })).toBe(false));
  it("guest → hidden", () => expect(shouldShowTrainingVideo({ ...ok, isGuest: true })).toBe(false));
  it("refresh every 5 minutes", () => expect(TRAINING_VIDEO_REFRESH_MS).toBe(300000));
  it("embed autoplays muted inline via official player", () => {
    const u = new URL(buildEmbedUrl("dQw4w9WgXcQ", "https://x.test"));
    expect(u.hostname).toBe("www.youtube-nocookie.com");
    expect(u.searchParams.get("autoplay")).toBe("1");
    expect(u.searchParams.get("mute")).toBe("1");
    expect(u.searchParams.get("playsinline")).toBe("1");
  });
});
