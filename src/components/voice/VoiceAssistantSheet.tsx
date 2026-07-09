import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Send, X, Volume2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useVoiceAssistant } from "@/contexts/VoiceAssistantContext";
import { startRecorder, type Recorder } from "@/lib/voice/recorder";
import { askAssistant, synthesizeSpeech, transcribeAudio, type AssistantTurn } from "@/lib/voice/api";
import { supabase } from "@/integrations/supabase/client";

const ROUTE_MAP: Record<string, string> = {
  home: "/home",
  bookings: "/bookings",
  availability: "/availability",
  profile: "/profile",
  earnings: "/earnings",
  "customer-reviews": "/customer-reviews",
  "account-details": "/account-details",
  settings: "/settings",
  "contact-support": "/contact-support",
  troubleshoot: "/troubleshoot",
};

type Turn = AssistantTurn & { id: string };

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function VoiceAssistantSheet() {
  const { open, closeAssistant } = useVoiceAssistant();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "recording" | "transcribing" | "thinking" | "speaking">("idle");
  const [textInput, setTextInput] = useState("");
  const [micDenied, setMicDenied] = useState(false);
  const [level, setLevel] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [languageHint, setLanguageHint] = useState<string>(i18n.language || "en");

  const recorderRef = useRef<Recorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Reset on close (keep conversation id so returning users continue where they left off)
  useEffect(() => {
    if (!open) {
      recorderRef.current?.cancel();
      recorderRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      setStatus("idle");
      setLevel(0);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns.length, status]);

  const logEvent = useCallback(async (event_type: string, payload?: unknown) => {
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      await supabase.from("voice_events").insert({ user_id: uid, event_type, payload: payload as any });
    } catch {
      // best-effort telemetry
    }
  }, []);

  useEffect(() => {
    if (open) void logEvent("assistant_opened");
  }, [open, logEvent]);

  const playSpeech = useCallback(async (text: string, language: string) => {
    try {
      setStatus("speaking");
      const blob = await synthesizeSpeech(text, language);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setStatus("idle");
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setStatus("idle");
      };
      await audio.play().catch(() => setStatus("idle"));
    } catch (err) {
      console.error("[voice] TTS failed", err);
      setStatus("idle");
    }
  }, []);

  const submitTurn = useCallback(
    async (userText: string) => {
      const clean = userText.trim();
      if (!clean) return;
      setErrorMsg(null);
      const userTurn: Turn = { id: newId(), role: "user", content: clean };
      const nextTurns = [...turns, userTurn];
      setTurns(nextTurns);
      setStatus("thinking");
      try {
        const messages: AssistantTurn[] = nextTurns.map((tt) => ({ role: tt.role, content: tt.content }));
        const res = await askAssistant({ messages, conversationId, language: languageHint });
        if (res.conversationId) setConversationId(res.conversationId);
        const assistantTurn: Turn = { id: newId(), role: "assistant", content: res.reply };
        setTurns((prev) => [...prev, assistantTurn]);

        // Handle any navigation the model asked for.
        for (const screen of res.navigate || []) {
          const path = ROUTE_MAP[screen];
          if (path) {
            void logEvent("assistant_navigate", { screen });
            navigate(path);
          }
        }
        if (res.language) setLanguageHint(res.language);
        void playSpeech(res.reply, res.language || languageHint);
      } catch (err) {
        console.error("[voice] assistant call failed", err);
        setErrorMsg(t("voice.errorGeneric", "Something went wrong. Please try again."));
        setStatus("idle");
        void logEvent("assistant_error", { message: String((err as Error)?.message ?? err) });
      }
    },
    [turns, conversationId, languageHint, navigate, playSpeech, t, logEvent],
  );

  const startRecording = useCallback(async () => {
    if (status !== "idle") return;
    setErrorMsg(null);
    try {
      // Stop any current TTS so we can capture cleanly.
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      const rec = await startRecorder({ onLevel: setLevel });
      recorderRef.current = rec;
      setStatus("recording");
      setMicDenied(false);
      void logEvent("mic_start");
    } catch (err) {
      console.warn("[voice] mic denied or unavailable", err);
      setMicDenied(true);
      setStatus("idle");
      void logEvent("mic_denied");
    }
  }, [status, logEvent]);

  const stopAndSend = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    setStatus("transcribing");
    let wav: Blob;
    try {
      wav = await rec.stop();
    } catch (err) {
      console.error("[voice] stop failed", err);
      setStatus("idle");
      return;
    }
    if (wav.size < 2500) {
      setErrorMsg(t("voice.tooShort", "That was too quiet. Please hold the button and speak."));
      setStatus("idle");
      return;
    }
    try {
      const { text } = await transcribeAudio(wav, languageHint);
      if (!text) {
        setErrorMsg(t("voice.noSpeech", "I didn't catch that. Please try again."));
        setStatus("idle");
        return;
      }
      await submitTurn(text);
    } catch (err) {
      console.error("[voice] STT failed", err);
      setErrorMsg(t("voice.errorGeneric", "Something went wrong. Please try again."));
      setStatus("idle");
    }
  }, [languageHint, submitTurn, t]);

  const onTextSubmit = useCallback(() => {
    const v = textInput.trim();
    if (!v) return;
    setTextInput("");
    void submitTurn(v);
  }, [textInput, submitTurn]);

  if (!open) return null;

  const busy = status === "transcribing" || status === "thinking";

  return (
    <div className="fixed inset-0 z-[125] flex items-end justify-center bg-background/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md rounded-t-3xl bg-card border-t border-border shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Volume2 className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">
                {t("voice.title", "Didi Assistant")}
              </div>
              <div className="text-xs text-muted-foreground">
                {status === "recording" && t("voice.listening", "Listening…")}
                {status === "transcribing" && t("voice.transcribing", "Understanding…")}
                {status === "thinking" && t("voice.thinking", "Thinking…")}
                {status === "speaking" && t("voice.speaking", "Speaking…")}
                {status === "idle" && t("voice.tapToSpeak", "Tap the mic to speak")}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="h-9 w-9 rounded-full hover:bg-muted flex items-center justify-center"
            onClick={closeAssistant}
            aria-label={t("common.cancel", "Close")}
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[180px]">
          {turns.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-6 leading-relaxed">
              {t(
                "voice.emptyState",
                "Ask me anything — earnings, priority score, ratings, bookings, or how to fix notifications.",
              )}
            </div>
          )}
          {turns.map((tt) => (
            <div
              key={tt.id}
              className={`flex ${tt.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={
                  tt.role === "user"
                    ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2 max-w-[85%] text-sm"
                    : "bg-muted text-foreground rounded-2xl rounded-bl-sm px-4 py-2 max-w-[85%] text-sm leading-relaxed"
                }
              >
                {tt.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2 text-sm text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {status === "transcribing" ? t("voice.transcribing", "Understanding…") : t("voice.thinking", "Thinking…")}
              </div>
            </div>
          )}
          {errorMsg && (
            <div className="text-xs text-destructive text-center">{errorMsg}</div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border space-y-3">
          {!micDenied ? (
            <div className="flex items-center justify-center">
              <button
                type="button"
                disabled={busy || status === "speaking"}
                onPointerDown={startRecording}
                onPointerUp={stopAndSend}
                onPointerCancel={() => {
                  recorderRef.current?.cancel();
                  recorderRef.current = null;
                  setStatus("idle");
                }}
                className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-all ${
                  status === "recording"
                    ? "bg-destructive text-destructive-foreground scale-110"
                    : "bg-primary text-primary-foreground"
                } ${busy || status === "speaking" ? "opacity-60" : "active:scale-95"}`}
                aria-label={t("voice.holdToTalk", "Hold to talk")}
              >
                {status === "recording" && (
                  <span
                    className="absolute inset-0 rounded-full bg-destructive/40"
                    style={{ transform: `scale(${1 + Math.min(level, 1) * 0.6})`, transition: "transform 60ms linear" }}
                    aria-hidden
                  />
                )}
                <Mic className="relative h-7 w-7" />
              </button>
            </div>
          ) : (
            <div className="text-xs text-center text-muted-foreground">
              {t("voice.micDenied", "Microphone is off. Type your question below.")}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onTextSubmit(); }}
              placeholder={t("voice.typePlaceholder", "Or type your question…")}
              className="flex-1 h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              disabled={busy}
            />
            <button
              type="button"
              onClick={onTextSubmit}
              disabled={busy || !textInput.trim()}
              className="h-11 w-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 active:scale-95"
              aria-label={t("common.confirm", "Send")}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
