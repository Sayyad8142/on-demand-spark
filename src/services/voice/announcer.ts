// Voice announcer — plays short spoken messages via the existing voice-tts
// edge function. Serializes utterances so overlapping alerts don't collide.
// Fails silently: any TTS/network error just drops the utterance, never crashes UI.
import { synthesizeSpeech } from "@/lib/voice/api";

type Utterance = { text: string; language: string; tag?: string };

let queue: Utterance[] = [];
let playing = false;
let currentAudio: HTMLAudioElement | null = null;
let suppressed = false;

export function setAnnouncerSuppressed(v: boolean) {
  suppressed = v;
  if (v) stopAnnouncer();
}

export function stopAnnouncer() {
  queue = [];
  if (currentAudio) {
    try { currentAudio.pause(); } catch {}
    currentAudio = null;
  }
  playing = false;
}

export async function speakNow(text: string, language: string, tag?: string) {
  if (suppressed) return;
  const clean = String(text || "").trim();
  if (!clean) return;
  queue.push({ text: clean.slice(0, 500), language: language || "en", tag });
  if (!playing) void drain();
}

async function drain() {
  playing = true;
  while (queue.length > 0 && !suppressed) {
    const next = queue.shift()!;
    try {
      const blob = await synthesizeSpeech(next.text, next.language);
      if (suppressed) break;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;
      await new Promise<void>((resolve) => {
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        audio.play().catch(() => resolve());
      });
      currentAudio = null;
    } catch (err) {
      console.warn("[VoiceAnnouncer] utterance failed", (err as Error)?.message);
    }
  }
  playing = false;
}
