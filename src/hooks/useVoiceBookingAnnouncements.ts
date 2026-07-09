// Announces new booking offers via TTS. Guards: prefs enabled, not suppressed,
// no active job (Feature: never announce while a job is already in progress),
// dedupe by bookingId, and stop announcer if the offer is dismissed elsewhere.
import { useEffect, useRef } from "react";
import { onNewAlert, onAlertDismissed, type BookingAlert } from "@/services/bookingAlertCoordinator";
import { speakNow, stopAnnouncer } from "@/services/voice/announcer";
import { voicePrefs } from "@/lib/voice/prefs";
import i18n from "@/i18n/config";

function buildSummary(alert: BookingAlert, lang: string): string {
  const service = alert.serviceType || "Cleaning";
  const community = alert.community || "";
  const flat = alert.flatNo ? `flat ${alert.flatNo}` : "";
  const price = alert.priceInr ? `${Math.round(alert.priceInr * 0.8)} rupees for you` : "";
  if (lang.startsWith("hi")) {
    return `Nayi booking! ${service}, ${community} ${flat}. ${price ? price + "." : ""} Kya aap accept karna chahenge?`;
  }
  if (lang.startsWith("te")) {
    return `Kotha booking! ${service}, ${community} ${flat}. ${price ? price + "." : ""} Meeru accept cheyaalanukuntunnara?`;
  }
  return `New booking! ${service} at ${community} ${flat}. ${price ? price + "." : ""} Would you like to accept?`;
}

export function useVoiceBookingAnnouncements(opts: {
  hasActiveJob: boolean;
  suppressed: boolean;
}) {
  const spoken = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsubNew = onNewAlert((alert) => {
      if (!voicePrefs.announceEnabled()) return;
      if (opts.suppressed) return;
      if (opts.hasActiveJob) return;
      if (spoken.current.has(alert.bookingId)) return;
      spoken.current.add(alert.bookingId);
      const lang = i18n.language || "en";
      void speakNow(buildSummary(alert, lang), lang, `booking:${alert.bookingId}`);
    });
    const unsubDismiss = onAlertDismissed(() => {
      stopAnnouncer();
    });
    return () => { unsubNew(); unsubDismiss(); };
  }, [opts.hasActiveJob, opts.suppressed]);
}
