// Idle tips: if online, no active job, no suppression, and idle 20+ min, speak
// one short tip. Rate-limited to at most one tip every 2 hours.
import { useEffect, useRef } from "react";
import { speakNow } from "@/services/voice/announcer";
import { voicePrefs } from "@/lib/voice/prefs";
import i18n from "@/i18n/config";

const TIPS_EN = [
  "Tip: keep your online status on during peak hours 8 to 11 AM and 5 to 8 PM.",
  "Tip: a friendly greeting to the customer often leads to a 5 star rating.",
  "Tip: mark more availability slots to receive more booking offers.",
  "Tip: keep your phone charged and notifications on so you don't miss bookings.",
];
const TIPS_HI = [
  "Sujhav: subah 8 se 11 aur shaam 5 se 8 baje online rahiye.",
  "Sujhav: customer se namaste bolne se 5 star rating milti hai.",
  "Sujhav: zyada availability slots select kariye zyada bookings ke liye.",
];
const TIPS_TE = [
  "Chinna suchana: udayam 8 nunchi 11 varaku, saayankalam 5 nunchi 8 varaku online undandi.",
  "Chinna suchana: customer ki namaste cheppadam valla 5 star vachhే avakasham ekkuva.",
];

const TWO_HOURS = 2 * 60 * 60 * 1000;
const IDLE_MS = 20 * 60 * 1000;

export function useIdleTips(opts: {
  isOnline: boolean;
  hasActiveJob: boolean;
  suppressed: boolean;
}) {
  const lastActivity = useRef<number>(Date.now());
  useEffect(() => {
    const bump = () => { lastActivity.current = Date.now(); };
    window.addEventListener("touchstart", bump, { passive: true });
    window.addEventListener("click", bump);
    window.addEventListener("keydown", bump);
    return () => {
      window.removeEventListener("touchstart", bump);
      window.removeEventListener("click", bump);
      window.removeEventListener("keydown", bump);
    };
  }, []);

  useEffect(() => {
    if (!opts.isOnline || opts.hasActiveJob || opts.suppressed) return;
    if (!voicePrefs.tipsEnabled()) return;
    const interval = setInterval(() => {
      const idleFor = Date.now() - lastActivity.current;
      if (idleFor < IDLE_MS) return;
      const sinceLast = Date.now() - voicePrefs.lastTipAt();
      if (sinceLast < TWO_HOURS) return;
      voicePrefs.markTipNow();
      const lang = i18n.language || "en";
      const pool = lang.startsWith("hi") ? TIPS_HI : lang.startsWith("te") ? TIPS_TE : TIPS_EN;
      const tip = pool[Math.floor(Math.random() * pool.length)];
      void speakNow(tip, lang, "tip");
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [opts.isOnline, opts.hasActiveJob, opts.suppressed]);
}
