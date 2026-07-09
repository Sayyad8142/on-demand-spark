import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X, ChevronRight, RotateCcw, MessageCircleQuestion, SkipForward, Loader2 } from "lucide-react";
import { synthesizeSpeech } from "@/lib/voice/api";
import { useVoiceAssistant } from "@/contexts/VoiceAssistantContext";

// First-time voice-guided tour. Purely presentational — no data writes.
// Persistence is via localStorage so it does not touch existing DB schema.
const TOUR_KEY = "didi-tour-v1-completed";

type Step = {
  route: string;
  titleKey: string;
  bodyKey: string;
};

const STEPS: Step[] = [
  { route: "/home",             titleKey: "tour.home.title",         bodyKey: "tour.home.body" },
  { route: "/bookings",         titleKey: "tour.bookings.title",     bodyKey: "tour.bookings.body" },
  { route: "/availability",     titleKey: "tour.availability.title", bodyKey: "tour.availability.body" },
  { route: "/profile",          titleKey: "tour.priority.title",     bodyKey: "tour.priority.body" },
  { route: "/customer-reviews", titleKey: "tour.ratings.title",      bodyKey: "tour.ratings.body" },
  { route: "/earnings",         titleKey: "tour.payments.title",     bodyKey: "tour.payments.body" },
  { route: "/profile",          titleKey: "tour.profile.title",      bodyKey: "tour.profile.body" },
  { route: "/settings",         titleKey: "tour.settings.title",     bodyKey: "tour.settings.body" },
  { route: "/home",             titleKey: "tour.coach.title",        bodyKey: "tour.coach.body" },
];

export function tourAlreadyCompleted(): boolean {
  try { return localStorage.getItem(TOUR_KEY) === "1"; } catch { return false; }
}
export function markTourCompleted() {
  try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* ignore */ }
}
export function resetTour() {
  try { localStorage.removeItem(TOUR_KEY); } catch { /* ignore */ }
}

export default function GuidedTour({ open, onFinish }: { open: boolean; onFinish: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { openAssistant } = useVoiceAssistant();
  const [idx, setIdx] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = useCallback(async (text: string) => {
    try {
      setSpeaking(true);
      const blob = await synthesizeSpeech(text, i18n.language || "en");
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); setSpeaking(false); };
      audio.onerror = () => { URL.revokeObjectURL(url); setSpeaking(false); };
      await audio.play().catch(() => setSpeaking(false));
    } catch { setSpeaking(false); }
  }, [i18n.language]);

  const stopSpeech = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(false);
  }, []);

  const goToStep = useCallback((newIdx: number) => {
    stopSpeech();
    if (newIdx >= STEPS.length) {
      markTourCompleted();
      onFinish();
      return;
    }
    setIdx(newIdx);
    const step = STEPS[newIdx];
    navigate(step.route);
    setTimeout(() => { void speak(t(step.bodyKey)); }, 350);
  }, [navigate, onFinish, speak, stopSpeech, t]);

  useEffect(() => {
    if (open) {
      setIdx(0);
      const step = STEPS[0];
      navigate(step.route);
      setTimeout(() => { void speak(t(step.bodyKey)); }, 350);
    } else {
      stopSpeech();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const step = STEPS[idx];

  return (
    <div className="fixed inset-0 z-[135] flex items-end justify-center bg-background/40 backdrop-blur-[2px]">
      <div className="w-full max-w-md m-3 rounded-2xl bg-card border-2 border-primary/30 shadow-2xl p-5 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">
            {t("tour.stepLabel", "Step")} {idx + 1} / {STEPS.length}
          </div>
          <button
            type="button"
            onClick={() => { markTourCompleted(); stopSpeech(); onFinish(); }}
            className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center"
            aria-label={t("common.cancel", "Close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">{t(step.titleKey)}</h2>
          <p className="mt-2 text-sm text-foreground leading-relaxed">{t(step.bodyKey)}</p>
          {speaking && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("voice.speaking", "Speaking…")}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => { stopSpeech(); void speak(t(step.bodyKey)); }}
            className="h-11 rounded-xl border border-border text-sm font-medium inline-flex items-center justify-center gap-1.5 active:scale-95"
          >
            <RotateCcw className="h-4 w-4" /> {t("tour.repeat", "Repeat")}
          </button>
          <button
            type="button"
            onClick={() => { stopSpeech(); openAssistant(); }}
            className="h-11 rounded-xl border border-border text-sm font-medium inline-flex items-center justify-center gap-1.5 active:scale-95"
          >
            <MessageCircleQuestion className="h-4 w-4" /> {t("tour.ask", "Ask")}
          </button>
          <button
            type="button"
            onClick={() => { markTourCompleted(); stopSpeech(); onFinish(); }}
            className="h-11 rounded-xl border border-border text-sm font-medium inline-flex items-center justify-center gap-1.5 active:scale-95"
          >
            <SkipForward className="h-4 w-4" /> {t("tour.skip", "Skip")}
          </button>
          <button
            type="button"
            onClick={() => goToStep(idx + 1)}
            className="h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-1.5 active:scale-95"
          >
            {idx === STEPS.length - 1 ? t("tour.finish", "Finish") : t("tour.next", "Next")}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
