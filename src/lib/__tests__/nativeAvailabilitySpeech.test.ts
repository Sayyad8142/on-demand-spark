import { it, expect, vi } from "vitest";
import { createNativeSpeechEngine } from "../availabilityVoice";

it("waits for Android asynchronous service initialization before checking Telugu", async () => {
  vi.useFakeTimers();
  const tts = {
    getSupportedVoices: vi.fn().mockResolvedValueOnce({ voices: [] }).mockResolvedValue({ voices: [{ name: "te", lang: "te-IN" }] }),
    isLanguageSupported: vi.fn().mockResolvedValue({ supported: true }),
    speak: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined),
  };
  const engine = createNativeSpeechEngine(async () => tts);
  const ready = engine.isSupported("te-IN");
  await vi.advanceTimersByTimeAsync(200);
  expect(await ready).toBe(true);
  expect(tts.getSupportedVoices).toHaveBeenCalledTimes(2);
  expect(tts.isLanguageSupported).toHaveBeenCalledWith({ lang: "te-IN" });
  vi.useRealTimers();
});
it("stop resolves speech even when Android discards the completion callback", async () => {
  const tts = {
    getSupportedVoices: vi.fn().mockResolvedValue({ voices: [] }),
    isLanguageSupported: vi.fn().mockResolvedValue({ supported: true }),
    speak: vi.fn().mockReturnValue(new Promise(() => {})), stop: vi.fn().mockResolvedValue(undefined),
  };
  const engine = createNativeSpeechEngine(async () => tts);
  const playing = engine.speak("काम का समय", "hi-IN");
  await new Promise(resolve => setTimeout(resolve, 0));
  await engine.stop();
  await expect(playing).resolves.toBeUndefined();
  expect(tts.stop).toHaveBeenCalledOnce();
});