/**
 * Flat-number announcement for the active booking card.
 *
 * Root cause of the old silent speaker: the card only used the Web Speech API,
 * which the Android WebView usually does not provide, so the tap returned
 * without a sound. Now: native Android TextToSpeech (CancellationVoice plugin)
 * first, Web Speech second. Display-only — never changes booking data.
 */
import { Capacitor } from "@capacitor/core";

const DIGITS: Record<string, Record<string, string>> = {
  en: { "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine" },
  hi: { "0": "शून्य", "1": "एक", "2": "दो", "3": "तीन", "4": "चार", "5": "पाँच", "6": "छह", "7": "सात", "8": "आठ", "9": "नौ" },
};

/** Spell each digit separately; letters are kept as single characters. */
export function spellDigits(value: string, lang: "en" | "hi" = "en"): string {
  return Array.from(String(value ?? "").replace(/\s+/g, ""))
    .map((c) => DIGITS[lang][c] ?? c.toUpperCase())
    .join(" ");
}

export function buildFlatAnnouncement(flatNo: string, opts: { villa?: boolean; lang?: string } = {}): { text: string; lang: string } {
  const hindi = opts.lang === "hi" || opts.lang === "te";
  const spelled = spellDigits(flatNo, hindi ? "hi" : "en");
  if (hindi) return { text: `${opts.villa ? "विला" : "फ्लैट"} नंबर ${spelled}`, lang: "hi-IN" };
  return { text: `${opts.villa ? "Villa" : "Flat"} number ${spelled}`, lang: "en-IN" };
}

let busy = false;

function nativePlugin(): any | null {
  if (!Capacitor.isNativePlatform()) return null;
  const p = (window as any)?.Capacitor?.Plugins?.CancellationVoice;
  return p && typeof p.speak === "function" ? p : null;
}

function webSpeak(text: string, lang: string): Promise<boolean> {
  return new Promise((resolve) => {
    const synth = (window as any).speechSynthesis as SpeechSynthesis | undefined;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") return resolve(false);
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      const voices = synth.getVoices();
      const prefix = lang.split("-")[0];
      const pool = voices.filter((v) => v.lang.startsWith(prefix));
      const female = pool.find((v) => /female|woman|heera|swara|kalpana|neerja/i.test(v.name));
      const voice = female || pool.find((v) => v.lang === lang) || pool[0];
      if (voice) u.voice = voice;
      u.rate = 0.85;
      u.volume = 1;
      const timeout = window.setTimeout(() => resolve(true), 8000);
      u.onend = () => { window.clearTimeout(timeout); resolve(true); };
      u.onerror = () => { window.clearTimeout(timeout); resolve(false); };
      synth.speak(u);
    } catch {
      resolve(false);
    }
  });
}

/** Returns true when speech played. Repeated taps while speaking are ignored. */
export async function announceFlat(text: string, lang: string): Promise<boolean> {
  if (busy) return true;
  busy = true;
  try {
    const native = nativePlugin();
    if (native && lang.startsWith("en")) {
      try {
        const res = await native.speak({ text, repeats: 1 });
        if (res?.started !== false || res?.reason === "already_playing") {
          await new Promise((r) => window.setTimeout(r, 3500));
          return true;
        }
      } catch { /* fall through to web speech */ }
    }
    if (await webSpeak(text, lang)) return true;
    if (native && !lang.startsWith("en")) {
      // Native engine is English-only: fall back to an English announcement.
      try { await native.speak({ text, repeats: 1 }); await new Promise((r) => window.setTimeout(r, 3500)); return true; } catch { /* no-op */ }
    }
    return false;
  } finally {
    busy = false;
  }
}

export function isAnnouncing(): boolean {
  return busy;
}
