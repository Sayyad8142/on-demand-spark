/**
 * Spoken help for the Availability screen ("When Can You Work?").
 *
 * Display-only: it reads instructions aloud and never touches slots, saving,
 * availability status or dispatch. One player per screen; a tap while speaking
 * stops the voice (no overlap), the next tap replays from the start.
 *
 * Engines are tried in order: phone text-to-speech (Android/iOS plugin, only
 * when the installed app contains it) → browser speech → English fallback when
 * the worker's language voice is missing on the phone.
 */
import { Capacitor } from "@capacitor/core";

export type GuideLang = "en" | "hi" | "te";
export type GuideState = "idle" | "loading" | "playing";
export type GuideResult = "spoken" | "fallback_english" | "stopped" | "unavailable";

export const GUIDE_LOCALE: Record<GuideLang, string> = { en: "en-IN", hi: "hi-IN", te: "te-IN" };

export const AVAILABILITY_GUIDE: Record<GuideLang, string> = {
  en: "Select the days and times when you can work. Green means selected. After choosing your times, tap Save My Working Time.",
  te: "మీరు పని చేయగల రోజులు, సమయాలు ఎంచుకోండి. ఆకుపచ్చ రంగులో ఉన్నవి మీరు ఎంచుకున్న సమయాలు. ఎంచుకున్న తర్వాత సేవ్ బటన్ నొక్కండి.",
  hi: "आप जिन दिनों और समय पर काम कर सकती हैं, उन्हें चुनें। हरे रंग का मतलब है कि समय चुना गया है। चुनने के बाद सेव बटन दबाएँ।",
};

/** Slow, clear speech for everyday listeners. */
export const GUIDE_RATE = 0.85;

export function guideLanguage(lang: string | null | undefined): GuideLang {
  const base = String(lang ?? "").toLowerCase().split(/[-_]/)[0];
  return base === "hi" || base === "te" ? base : "en";
}

type VoiceLike = { name?: string; lang?: string };
const FEMALE_HINT = /female|woman|lekha|veena|heera|swara|kalpana|neerja|shruti|aditi|raveena|geeta|kajal|priya/i;
const MALE_HINT = /(^|[^e])male|rishi|hemant|prabhat|ravi/i;

/** Index of the best voice for a locale: a female one when the name says so, else any voice for that language. */
export function pickVoiceIndex(voices: VoiceLike[], locale: string): number {
  const prefix = locale.toLowerCase().split("-")[0];
  const norm = (v: VoiceLike) => String(v.lang ?? "").toLowerCase().replace("_", "-");
  const pool = voices.map((v, i) => ({ v, i })).filter(({ v }) => norm(v).startsWith(prefix));
  if (pool.length === 0) return -1;
  const female = pool.find(({ v }) => FEMALE_HINT.test(v.name ?? ""));
  if (female) return female.i;
  const exactNotMale = pool.find(({ v }) => norm(v) === locale.toLowerCase() && !MALE_HINT.test(v.name ?? ""));
  if (exactNotMale) return exactNotMale.i;
  const notMale = pool.find(({ v }) => !MALE_HINT.test(v.name ?? ""));
  return (notMale ?? pool[0]).i;
}

export interface SpeechEngine {
  isSupported(locale: string): Promise<boolean>;
  /** Resolves when speech ends; rejects when the engine fails. */
  speak(text: string, locale: string): Promise<void>;
  stop(): void | Promise<void>;
}

export function createGuidePlayer(engines: SpeechEngine[], onState: (s: GuideState) => void, texts: Record<GuideLang, string> = AVAILABILITY_GUIDE) {
  let session = 0;
  let state: GuideState = "idle";
  let active: SpeechEngine | null = null;
  const set = (s: GuideState) => { state = s; onState(s); };

  const stop = () => {
    session++;
    const e = active;
    active = null;
    if (e) { try { void Promise.resolve(e.stop()).catch(() => {}); } catch { /* no-op */ } }
    if (state !== "idle") set("idle");
  };

  async function attempt(id: number, text: string, locale: string): Promise<boolean | "stopped"> {
    for (const engine of engines) {
      let ok = false;
      try { ok = await engine.isSupported(locale); } catch { ok = false; }
      if (id !== session) return "stopped";
      if (!ok) continue;
      active = engine;
      set("playing");
      try {
        await engine.speak(text, locale);
        return id === session ? true : "stopped";
      } catch {
        if (id !== session) return "stopped";
        active = null;
        set("loading");
      }
    }
    return false;
  }

  async function play(langInput: string | null | undefined): Promise<GuideResult> {
    if (state !== "idle") { stop(); return "stopped"; }
    const id = ++session;
    set("loading");
    const lang = guideLanguage(langInput);
    const first = await attempt(id, texts[lang], GUIDE_LOCALE[lang]);
    let result: GuideResult;
    if (first === "stopped") return "stopped";
    if (first) result = "spoken";
    else if (lang !== "en") {
      const en = await attempt(id, texts.en, GUIDE_LOCALE.en);
      if (en === "stopped") return "stopped";
      result = en ? "fallback_english" : "unavailable";
    } else result = "unavailable";
    if (id === session) { active = null; set("idle"); }
    return result;
  }

  return { play, stop, getState: () => state };
}

/* ---------- Real engines ---------- */

export function nativeSpeechEngine(): SpeechEngine | null {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("TextToSpeech")) return null;
  const load = () => import("@capacitor-community/text-to-speech").then((m) => m.TextToSpeech);
  return createNativeSpeechEngine(load);
}

type NativeTts = Pick<typeof import("@capacitor-community/text-to-speech").TextToSpeech, "getSupportedVoices" | "isLanguageSupported" | "speak" | "stop">;
/** The Android plugin initializes asynchronously and drops callbacks on stop. */
export function createNativeSpeechEngine(load: () => Promise<NativeTts>): SpeechEngine {
  let finishStopped: (() => void) | null = null;
  return {
    async isSupported(locale) {
      const tts = await load();
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const { voices } = await tts.getSupportedVoices();
          if (voices?.length) return !!(await tts.isLanguageSupported({ lang: locale })).supported;
        } catch { /* Android service is not initialized yet. */ }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      return !!(await tts.isLanguageSupported({ lang: locale })).supported;
    },
    async speak(text, locale) {
      const tts = await load();
      let voice: number | undefined;
      try {
        const { voices } = await tts.getSupportedVoices();
        const idx = pickVoiceIndex(voices ?? [], locale);
        if (idx >= 0) voice = idx;
      } catch { /* default voice */ }
      await new Promise<void>((resolve, reject) => {
        let done = false;
        const settle = (error?: Error) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          finishStopped = null;
          if (error) reject(error); else resolve();
        };
        const timer = setTimeout(() => {
          void tts.stop().catch(() => {});
          settle(new Error("Speech did not finish"));
        }, 60_000);
        finishStopped = () => settle();
        void tts.speak({ text, lang: locale, rate: GUIDE_RATE, pitch: 1.05, volume: 1, voice, category: "playback", queueStrategy: 0 })
          .then(() => settle(), () => settle(new Error("Native speech failed")));
      });
    },
    stop() {
      finishStopped?.();
      return load().then((tts) => tts.stop()).catch(() => {});
    },
  };
}

function waitForVoices(synth: SpeechSynthesis, ms = 1200): Promise<SpeechSynthesisVoice[]> {
  const now = synth.getVoices();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => { window.clearTimeout(t); synth.removeEventListener?.("voiceschanged", done); resolve(synth.getVoices()); };
    const t = window.setTimeout(done, ms);
    synth.addEventListener?.("voiceschanged", done);
  });
}

export function webSpeechEngine(): SpeechEngine | null {
  if (typeof window === "undefined") return null;
  const synth = window.speechSynthesis as SpeechSynthesis | undefined;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return null;
  return {
    async isSupported(locale) {
      const voices = await waitForVoices(synth);
      return pickVoiceIndex(voices, locale) >= 0;
    },
    speak(text, locale) {
      return new Promise<void>((resolve, reject) => {
        try {
          synth.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.lang = locale;
          const voices = synth.getVoices();
          const idx = pickVoiceIndex(voices, locale);
          if (idx >= 0) u.voice = voices[idx];
          u.rate = GUIDE_RATE;
          u.pitch = 1.05;
          u.volume = 1;
          u.onend = () => resolve();
          u.onerror = (e) => (e?.error === "interrupted" || e?.error === "canceled" ? resolve() : reject(e));
          synth.speak(u);
        } catch (err) {
          reject(err);
        }
      });
    },
    stop() { try { synth.cancel(); } catch { /* no-op */ } },
  };
}

export function defaultGuideEngines(): SpeechEngine[] {
  return [nativeSpeechEngine(), webSpeechEngine()].filter((e): e is SpeechEngine => e !== null);
}
