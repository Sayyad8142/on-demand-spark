import { describe, it, expect, vi } from "vitest";
import { AVAILABILITY_GUIDE, createGuidePlayer, guideLanguage, pickVoiceIndex, type SpeechEngine } from "@/lib/availabilityVoice";
import en from "@/i18n/locales/en.json";
import hi from "@/i18n/locales/hi.json";
import te from "@/i18n/locales/te.json";

function fakeEngine(supported: string[], opts: { fail?: boolean } = {}) {
  const spoken: { text: string; locale: string }[] = [];
  let finish: (() => void) | null = null;
  const engine: SpeechEngine & { spoken: typeof spoken; finish: () => void; stops: number } = {
    spoken,
    stops: 0,
    finish: () => finish?.(),
    isSupported: async (l) => supported.includes(l),
    speak: (text, locale) => {
      spoken.push({ text, locale });
      if (opts.fail) return Promise.reject(new Error("engine failed"));
      return new Promise<void>((r) => { finish = r; });
    },
    stop() { engine.stops++; finish?.(); },
  };
  return engine;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("availability voice help", () => {
  it("uses the worker's app language, English otherwise", () => {
    expect(guideLanguage("te")).toBe("te");
    expect(guideLanguage("hi-IN")).toBe("hi");
    expect(guideLanguage("fr")).toBe("en");
    expect(guideLanguage(undefined)).toBe("en");
  });

  it("speaks the Telugu instructions with the Telugu voice", async () => {
    const e = fakeEngine(["te-IN", "en-IN"]);
    const p = createGuidePlayer([e], () => {});
    const done = p.play("te");
    await tick();
    expect(e.spoken[0]).toEqual({ text: AVAILABILITY_GUIDE.te, locale: "te-IN" });
    e.finish();
    expect(await done).toBe("spoken");
    expect(p.getState()).toBe("idle");
  });

  it("falls back to English when the Hindi voice is missing", async () => {
    const e = fakeEngine(["en-IN"]);
    const p = createGuidePlayer([e], () => {});
    const done = p.play("hi");
    await tick(); await tick();
    expect(e.spoken).toEqual([{ text: AVAILABILITY_GUIDE.en, locale: "en-IN" }]);
    e.finish();
    expect(await done).toBe("fallback_english");
  });

  it("moves to the next engine when the first one fails", async () => {
    const bad = fakeEngine(["hi-IN"], { fail: true });
    const good = fakeEngine(["hi-IN"]);
    const p = createGuidePlayer([bad, good], () => {});
    const done = p.play("hi");
    await tick(); await tick();
    expect(good.spoken[0].locale).toBe("hi-IN");
    good.finish();
    expect(await done).toBe("spoken");
  });

  it("reports unavailable when no voice exists", async () => {
    const p = createGuidePlayer([], () => {});
    expect(await p.play("en")).toBe("unavailable");
  });

  it("a second tap stops the voice instead of overlapping; next tap replays", async () => {
    const e = fakeEngine(["en-IN"]);
    const states: string[] = [];
    const p = createGuidePlayer([e], (s) => states.push(s));
    const first = p.play("en");
    await tick();
    expect(p.getState()).toBe("playing");
    expect(await p.play("en")).toBe("stopped");
    expect(await first).toBe("stopped");
    expect(e.stops).toBe(1);
    expect(e.spoken).toHaveLength(1);
    expect(p.getState()).toBe("idle");
    expect(states).toEqual(["loading", "playing", "idle"]);
    const again = p.play("en");
    await tick();
    expect(e.spoken).toHaveLength(2);
    e.finish();
    expect(await again).toBe("spoken");
  });

  it("stop (leaving the screen) silences it even while still loading", async () => {
    const e = fakeEngine(["en-IN"]);
    const p = createGuidePlayer([e], () => {});
    const done = p.play("en");
    p.stop();
    expect(await done).toBe("stopped");
    expect(e.spoken).toHaveLength(0);
  });

  it("prefers a female voice for the language", () => {
    const voices = [
      { name: "Rishi", lang: "en-IN" },
      { name: "Veena", lang: "en-IN" },
      { name: "Lekha", lang: "hi-IN" },
    ];
    expect(pickVoiceIndex(voices, "en-IN")).toBe(1);
    expect(pickVoiceIndex(voices, "hi-IN")).toBe(2);
    expect(pickVoiceIndex(voices, "te-IN")).toBe(-1);
    expect(pickVoiceIndex([{ name: "hi-in-x-hia-local", lang: "hi_IN" }], "hi-IN")).toBe(0);
  });

  it("button labels match the requested wording in all three languages", () => {
    expect(en.availability.title).toBe("When Can You Work?");
    expect(en.availability.selectAll).toBe("Full Day");
    expect(en.availability.clear).toBe("Remove All");
    expect(en.availability.copyToAll).toBe("Same for Every Day");
    expect(en.availability.saveAvailability).toBe("Save My Working Time");
    expect(en.availability.timesSelected_other).toBe("{{count}} Times Selected");
    for (const loc of [hi, te]) {
      for (const k of ["title", "selectAll", "clear", "copyToAll", "saveAvailability", "timesSelected_one", "timesSelected_other", "voiceListen", "voiceStop", "voiceLoading", "voiceUnavailable"]) {
        expect((loc.availability as unknown as Record<string, string>)[k]).toBeTruthy();
      }
    }
  });
});
