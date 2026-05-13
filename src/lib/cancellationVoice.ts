/**
 * Cancellation voice alert.
 *
 * Order of preference:
 *  1. Native CancellationVoice plugin (Android TextToSpeech via STREAM_ALARM + wake lock).
 *     This is the reliable path on real devices — Web Speech is flaky in WebView.
 *  2. Web Speech API (browser / dev preview).
 *  3. Bundled MP3 fallback.
 *
 * Singleton — duplicate calls while playing are no-ops, so duplicate cancellation events
 * (realtime + push + polling) cannot stack speech.
 */
import { Capacitor } from "@capacitor/core";

const PHRASE = "Booking cancelled. Booking cancelled.";
const REPEATS = 3;
const PAUSE_MS = 600;
const FALLBACK_AUDIO_SRC = "/sounds/booking_cancellation_voice.mp3";

let isPlaying = false;
let fallbackAudio: HTMLAudioElement | null = null;
let timers: number[] = [];

function clearTimers() {
  timers.forEach((id) => window.clearTimeout(id));
  timers = [];
}

function playWarningChirp() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.6, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* no-op */
  }
}

function vibratePattern() {
  try {
    if ("vibrate" in navigator) navigator.vibrate([400, 150, 400, 150, 800]);
  } catch {
    /* no-op */
  }
}

function playFallbackAudioOnce(): Promise<void> {
  return new Promise((resolve) => {
    try {
      fallbackAudio = new Audio(FALLBACK_AUDIO_SRC);
      fallbackAudio.loop = false;
      fallbackAudio.volume = 1;
      fallbackAudio.onended = () => resolve();
      fallbackAudio.onerror = () => resolve();
      fallbackAudio.play().catch((err) => {
        console.warn("[CANCEL_ALERT] fallback audio blocked", err);
        resolve();
      });
    } catch (err) {
      console.warn("[CANCEL_ALERT] fallback audio error", err);
      resolve();
    }
  });
}

async function runFallbackAudioLoop() {
  console.log("[CANCEL_ALERT] fallback_audio_used");
  for (let i = 0; i < REPEATS; i++) {
    if (!isPlaying) return;
    console.log(`[CANCEL_ALERT] repeat_${i + 1}`);
    await playFallbackAudioOnce();
    if (i < REPEATS - 1 && isPlaying) {
      await new Promise<void>((resolve) => {
        const id = window.setTimeout(resolve, PAUSE_MS);
        timers.push(id);
      });
    }
  }
  if (isPlaying) {
    console.log("[CANCEL_ALERT] completed_all_repeats");
    finishPlayback();
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
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
    await runFallbackAudioLoop();
    return;
  }
  console.log("[CANCEL_ALERT] speech_started");
  try {
    synth.cancel();
    for (let i = 0; i < REPEATS; i++) {
      if (!isPlaying) return;
      console.log(`[CANCEL_ALERT] repeat_${i + 1}`);
      await speakOnce(synth);
      if (i < REPEATS - 1 && isPlaying) {
        await new Promise<void>((resolve) => {
          const id = window.setTimeout(resolve, PAUSE_MS);
          timers.push(id);
        });
      }
    }
    if (isPlaying) {
      console.log("[CANCEL_ALERT] completed_all_repeats");
      console.log("[CANCEL_ALERT] speech_completed");
      finishPlayback();
    }
  } catch (err) {
    console.warn("[CANCEL_ALERT] speech error, using fallback", err);
    await runFallbackAudioLoop();
  }
}

/**
 * Mark playback as finished (auto-stop after all repeats).
 * Releases the duplicate-suppression flag without tearing down the popup —
 * the OK button only closes the modal now.
 */
function finishPlayback() {
  isPlaying = false;
  clearTimers();
  if (fallbackAudio) {
    try { fallbackAudio.pause(); } catch { /* no-op */ }
    fallbackAudio = null;
  }
}

function getNativePlugin(): any | null {
  if (!Capacitor.isNativePlatform()) return null;
  const plugin = (window as any)?.Capacitor?.Plugins?.CancellationVoice;
  return plugin && typeof plugin.speak === "function" ? plugin : null;
}

export function startCancellationVoice() {
  if (isPlaying) {
    console.log("[CANCEL_ALERT] duplicate_suppressed");
    return;
  }
  isPlaying = true;
  console.log("[CANCEL_ALERT] popup_shown");

  const native = getNativePlugin();
  if (native) {
    // Native path: TTS + vibration + wakelock + alarm-stream all handled in Java.
    native
      .speak({ text: PHRASE, repeats: REPEATS })
      .then((res: any) => console.log("[CANCEL_ALERT] native_started", res))
      .catch((err: any) => {
        console.warn("[CANCEL_ALERT] native plugin failed, using web fallback", err);
        vibratePattern();
        playWarningChirp();
        const id = window.setTimeout(() => {
          if (isPlaying) runSpeechLoop();
        }, 350);
        timers.push(id);
      });
    return;
  }

  // Web fallback (dev preview, browser).
  vibratePattern();
  playWarningChirp();
  const id = window.setTimeout(() => {
    if (isPlaying) runSpeechLoop();
  }, 350);
  timers.push(id);
}

export function stopCancellationVoice() {
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
  if (fallbackAudio) {
    try {
      fallbackAudio.pause();
      fallbackAudio.currentTime = 0;
    } catch {
      /* no-op */
    }
    fallbackAudio = null;
  }
  try {
    if ("vibrate" in navigator) navigator.vibrate(0);
  } catch {
    /* no-op */
  }
}

export function isCancellationVoicePlaying() {
  return isPlaying;
}
