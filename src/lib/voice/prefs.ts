// Preferences for Phase 3 assistant features (localStorage-backed toggles).
const KEYS = {
  briefing: "voice:briefingEnabled",
  summary: "voice:summaryEnabled",
  tips: "voice:tipsEnabled",
  announce: "voice:announceEnabled",
  lastBriefing: "voice:lastBriefingDate",
  lastSummary: "voice:lastSummaryDate",
  lastTip: "voice:lastTipAt",
} as const;

function getBool(key: string, dflt: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return dflt;
    return v === "1" || v === "true";
  } catch { return dflt; }
}
function setBool(key: string, v: boolean) {
  try { localStorage.setItem(key, v ? "1" : "0"); } catch {}
}

export const voicePrefs = {
  briefingEnabled: () => getBool(KEYS.briefing, true),
  setBriefing: (v: boolean) => setBool(KEYS.briefing, v),
  summaryEnabled: () => getBool(KEYS.summary, true),
  setSummary: (v: boolean) => setBool(KEYS.summary, v),
  tipsEnabled: () => getBool(KEYS.tips, false),
  setTips: (v: boolean) => setBool(KEYS.tips, v),
  announceEnabled: () => getBool(KEYS.announce, true),
  setAnnounce: (v: boolean) => setBool(KEYS.announce, v),

  lastBriefingDate: () => { try { return localStorage.getItem(KEYS.lastBriefing); } catch { return null; } },
  markBriefingToday: () => { try { localStorage.setItem(KEYS.lastBriefing, todayKey()); } catch {} },
  lastSummaryDate: () => { try { return localStorage.getItem(KEYS.lastSummary); } catch { return null; } },
  markSummaryToday: () => { try { localStorage.setItem(KEYS.lastSummary, todayKey()); } catch {} },
  lastTipAt: () => { try { return Number(localStorage.getItem(KEYS.lastTip) || 0); } catch { return 0; } },
  markTipNow: () => { try { localStorage.setItem(KEYS.lastTip, String(Date.now())); } catch {} },
};

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
