// Morning briefing: first app open per day, open the assistant in "briefing" mode
// and let the agent speak yesterday's stats + today's encouragement.
// One-shot per day (localStorage guard).
import { useEffect } from "react";
import { useVoiceAssistant } from "@/contexts/VoiceAssistantContext";
import { voicePrefs, todayKey } from "@/lib/voice/prefs";

export function useMorningBriefing(userId: string | undefined, suppressed: boolean) {
  const { openAssistant } = useVoiceAssistant();
  useEffect(() => {
    if (!userId) return;
    if (suppressed) return;
    if (!voicePrefs.briefingEnabled()) return;
    if (voicePrefs.lastBriefingDate() === todayKey()) return;
    // Only auto-open in the morning window 6am - noon local time.
    const hour = new Date().getHours();
    if (hour < 6 || hour >= 12) return;
    voicePrefs.markBriefingToday();
    const t = setTimeout(() => {
      openAssistant({ mode: "briefing", seed: "Give me my morning briefing." });
    }, 2500);
    return () => clearTimeout(t);
  }, [userId, suppressed, openAssistant]);
}
