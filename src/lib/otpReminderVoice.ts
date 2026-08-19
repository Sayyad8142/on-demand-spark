/**
 * OTP-pending voice reminder.
 *
 * Pattern mirrors cancellationVoice.ts:
 *  1. Native CancellationVoice plugin (Android TextToSpeech) — reuses the
 *     same plugin since it's just text-to-speech.
 *  2. Web Speech API fallback.
 *
 * Plays the phrase 3 times then stops. Singleton — duplicate calls while
 * playing are ignored.
 */
import { Capacitor } from "@capacitor/core";

const PHRASE = "OTP, OTP, please enter OTP.";
const REPEATS = 3;
const PAUSE_MS = 600;

let isPlaying = false;
let timers: number[] = [];

function clearTimers() {
  timers.forEach((id) => window.clearTimeout(id));
  timers = [];
}

function vibratePattern() {
  try {
    if ("vibrate" in navigator) navigator.vibrate([500, 200, 500, 200, 500]);
  } catch {
    /* no-op */
  }
}

function speakOnce(synth: SpeechSynthesis): Promise<void> {
  return new Promise((resolve) => {
    try {
      const u = new SpeechSynthesisUtterance(PHRASE);
      u.lang = "en-IN";
      u.rate = 0.95;
      u.pitch = 1;
      u.volume = 1;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
    } catch {
      resolve();
    }
  });
}

async function runSpeechLoop() {
  const synth = (window as any).speechSynthesis as SpeechSynthesis | undefined;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return;
  console.log("[OTP_REMINDER] speech_started");
  try {
    synth.cancel();
    for (let i = 0; i < REPEATS; i++) {
      if (!isPlaying) return;
      console.log(`[OTP_REMINDER] repeat_${i + 1}`);
      await speakOnce(synth);
      if (i < REPEATS - 1 && isPlaying) {
        await new Promise<void>((resolve) => {
          const id = window.setTimeout(resolve, PAUSE_MS);
          timers.push(id);
        });
      }
    }
    if (isPlaying) {
      console.log("[OTP_REMINDER] completed_all_repeats");
      isPlaying = false;
      clearTimers();
    }
  } catch (err) {
    console.warn("[OTP_REMINDER] speech error", err);
  }
}

function getNativePlugin(): any | null {
  if (!Capacitor.isNativePlatform()) return null;
  const plugin = (window as any)?.Capacitor?.Plugins?.CancellationVoice;
  return plugin && typeof plugin.speak === "function" ? plugin : null;
}

export function startOtpReminderVoice() {
  if (isPlaying) {
    console.log("[OTP_REMINDER] duplicate_suppressed");
    return;
  }
  isPlaying = true;
  console.log("[OTP_REMINDER] popup_shown");

  vibratePattern();

  const native = getNativePlugin();
  if (native) {
    native
      .speak({ text: PHRASE, repeats: REPEATS })
      .then((res: any) => console.log("[OTP_REMINDER] native_started", res))
      .catch((err: any) => {
        console.warn("[OTP_REMINDER] native plugin failed, falling back to web", err);
        const id = window.setTimeout(() => {
          if (isPlaying) runSpeechLoop();
        }, 250);
        timers.push(id);
      });
    return;
  }

  const id = window.setTimeout(() => {
    if (isPlaying) runSpeechLoop();
  }, 250);
  timers.push(id);
}

export function stopOtpReminderVoice() {
  if (!isPlaying) return;
  isPlaying = false;
  clearTimers();

  const native = getNativePlugin();
  if (native?.stop) {
    native.stop().catch(() => {});
  }

  try {
    (window as any).speechSynthesis?.cancel();
  } catch {
    /* no-op */
  }
  try {
    if ("vibrate" in navigator) navigator.vibrate(0);
  } catch {
    /* no-op */
  }
}

export function isOtpReminderVoicePlaying() {
  return isPlaying;
}
