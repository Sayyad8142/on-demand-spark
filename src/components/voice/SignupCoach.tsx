import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, X, Loader2, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { startRecorder, type Recorder } from "@/lib/voice/recorder";
import { askAssistant, synthesizeSpeech, transcribeAudio, type AssistantTurn } from "@/lib/voice/api";

// Voice-driven signup. Fills the parent form via onPatch, one field at a time.
// Never mutates any table — purely a form filler.
export type SignupPatch = {
  full_name?: string;
  phone?: string;
  community?: string;
  services?: string; // comma-separated
  upi_id?: string;
};

export type SignupCoachHandle = {
  present: {
    full_name?: string;
    phone?: string;
    community?: string;
    services?: string[];
    upi_id?: string;
  };
};

export default function SignupCoach({
  open,
  onClose,
  onPatch,
  presentValues,
}: {
  open: boolean;
  onClose: () => void;
  onPatch: (patch: SignupPatch) => void;
  presentValues: SignupCoachHandle["present"];
}) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<"idle" | "recording" | "transcribing" | "thinking" | "speaking">("idle");
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [languageHint, setLanguageHint] = useState<string>(i18n.language || "en");
  const [micDenied, setMicDenied] = useState(false);
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<Recorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const greetedRef = useRef(false);

  const speak = useCallback(async (text: string, language: string) => {
    try {
      setStatus("speaking");
      const blob = await synthesizeSpeech(text, language);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); setStatus("idle"); };
      audio.onerror = () => { URL.revokeObjectURL(url); setStatus("idle"); };
      await audio.play().catch(() => setStatus("idle"));
    } catch { setStatus("idle"); }
  }, []);

  const summariseState = useCallback(() => {
    const filled: string[] = [];
    if (presentValues.full_name) filled.push(`full_name=${presentValues.full_name}`);
    if (presentValues.phone) filled.push(`phone=${presentValues.phone}`);
    if (presentValues.community) filled.push(`community=${presentValues.community}`);
    if (presentValues.services && presentValues.services.length) filled.push(`services=${presentValues.services.join(", ")}`);
    if (presentValues.upi_id) filled.push(`upi_id=${presentValues.upi_id}`);
    return filled.length ? `Fields already filled: ${filled.join("; ")}.` : "Form is empty.";
  }, [presentValues]);

  const askAI = useCallback(async (userText: string | null) => {
    setStatus("thinking");
    try {
      const base: AssistantTurn[] = userText
        ? [...turns, { role: "user", content: userText }]
        : [...turns, { role: "user", content: `[start] ${summariseState()} Please greet me and ask for the next missing field.` }];
      const res = await askAssistant({ messages: base, language: languageHint, mode: "signup" });
      if (res.language) setLanguageHint(res.language);
      if (res.formPatch && Object.keys(res.formPatch).length) {
        onPatch(res.formPatch as SignupPatch);
      }
      const nextTurns: AssistantTurn[] = [...base, { role: "assistant", content: res.reply }];
      setTurns(nextTurns);
      await speak(res.reply, res.language || languageHint);
    } catch (e) {
      console.error("[signup-coach] failed", e);
      setStatus("idle");
    }
  }, [turns, languageHint, onPatch, speak, summariseState]);

  // Greet on first open
  useEffect(() => {
    if (open && !greetedRef.current) {
      greetedRef.current = true;
      void askAI(null);
    }
    if (!open) {
      recorderRef.current?.cancel();
      recorderRef.current = null;
      audioRef.current?.pause();
      audioRef.current = null;
      setStatus("idle");
      // reset greeting so it re-greets next time only if turns were cleared
    }
  }, [open, askAI]);

  const startRecording = useCallback(async () => {
    if (status !== "idle") return;
    try {
      audioRef.current?.pause();
      const rec = await startRecorder({ onLevel: setLevel });
      recorderRef.current = rec;
      setStatus("recording");
      setMicDenied(false);
    } catch {
      setMicDenied(true);
      setStatus("idle");
    }
  }, [status]);

  const stopAndSend = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    setStatus("transcribing");
    try {
      const wav = await rec.stop();
      if (wav.size < 2500) { setStatus("idle"); return; }
      const { text } = await transcribeAudio(wav, languageHint);
      if (!text) { setStatus("idle"); return; }
      await askAI(text);
    } catch (e) {
      console.error("[signup-coach] stt failed", e);
      setStatus("idle");
    }
  }, [languageHint, askAI]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-background/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Volume2 className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">{t("voice.signupTitle", "Sign up with voice")}</div>
              <div className="text-xs text-muted-foreground">
                {status === "recording" && t("voice.listening", "Listening…")}
                {status === "transcribing" && t("voice.transcribing", "Understanding…")}
                {status === "thinking" && t("voice.thinking", "Thinking…")}
                {status === "speaking" && t("voice.speaking", "Speaking…")}
                {status === "idle" && t("voice.holdToTalk", "Hold to talk")}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full hover:bg-muted flex items-center justify-center">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[220px]">
          {turns.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8 leading-relaxed">
              {t("voice.signupIntro", "I'll help you create your account. You can speak in Telugu, Hindi, or English.")}
            </div>
          )}
          {turns.map((tt, i) => (
            <div key={i} className={`flex ${tt.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={tt.role === "user"
                ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2 max-w-[85%] text-sm"
                : "bg-muted text-foreground rounded-2xl rounded-bl-sm px-4 py-2 max-w-[85%] text-sm leading-relaxed"}>
                {tt.content}
              </div>
            </div>
          ))}
          {(status === "thinking" || status === "transcribing") && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-4 py-2 text-sm text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {status === "transcribing" ? t("voice.transcribing", "Understanding…") : t("voice.thinking", "Thinking…")}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border">
          {micDenied ? (
            <div className="text-xs text-center text-muted-foreground">
              {t("voice.micDenied", "Microphone is off. Please allow the mic and try again.")}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                disabled={status === "thinking" || status === "transcribing" || status === "speaking"}
                onPointerDown={startRecording}
                onPointerUp={stopAndSend}
                onPointerCancel={() => { recorderRef.current?.cancel(); recorderRef.current = null; setStatus("idle"); }}
                className={`relative flex h-16 w-16 items-center justify-center rounded-full ${
                  status === "recording" ? "bg-destructive text-destructive-foreground scale-110" : "bg-primary text-primary-foreground"
                } disabled:opacity-60 active:scale-95 transition-all`}
                aria-label={t("voice.holdToTalk", "Hold to talk")}
              >
                {status === "recording" && (
                  <span className="absolute inset-0 rounded-full bg-destructive/40"
                    style={{ transform: `scale(${1 + Math.min(level, 1) * 0.6})`, transition: "transform 60ms linear" }} />
                )}
                <Mic className="relative h-7 w-7" />
              </button>
              <div className="text-[11px] text-muted-foreground">{t("voice.holdToTalk", "Hold to talk")}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
