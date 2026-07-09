// Evening summary: when the worker toggles offline in the evening (>= 6pm)
// after completing at least one booking today, open assistant in "summary" mode.
// One-shot per day.
import { useEffect, useRef } from "react";
import { useVoiceAssistant } from "@/contexts/VoiceAssistantContext";
import { voicePrefs, todayKey } from "@/lib/voice/prefs";

export function useEveningSummary(opts: {
  isOnline: boolean;
  suppressed: boolean;
}) {
  const { openAssistant } = useVoiceAssistant();
  const prevOnline = useRef<boolean | null>(null);
  useEffect(() => {
    const wasOnline = prevOnline.current;
    prevOnline.current = opts.isOnline;
    if (wasOnline !== true || opts.isOnline !== false) return;
    if (opts.suppressed) return;
    if (!voicePrefs.summaryEnabled()) return;
    if (voicePrefs.lastSummaryDate() === todayKey()) return;
    const hour = new Date().getHours();
    if (hour < 18) return;
    voicePrefs.markSummaryToday();
    const t = setTimeout(() => {
      openAssistant({ mode: "summary", seed: "Give me my evening summary." });
    }, 1200);
    return () => clearTimeout(t);
  }, [opts.isOnline, opts.suppressed, openAssistant]);
}
