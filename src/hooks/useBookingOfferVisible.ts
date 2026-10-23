import { useEffect, useState } from "react";
import { getCurrentAlert, onAlertDismissed, onNewAlert, type BookingAlert } from "@/services/bookingAlertCoordinator";
import { offerAlertActive } from "@/lib/updateDecision";

/** Read-only: true while a booking offer popup is active. Never touches offers or acceptance. */
export function useBookingOfferVisible(): boolean {
  const [state, setState] = useState<{ alert: BookingAlert | null; shownAt: number | null }>(() => {
    const a = getCurrentAlert();
    return { alert: a, shownAt: a ? Date.now() : null };
  });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const offNew = onNewAlert((a) => { setState({ alert: a, shownAt: Date.now() }); setNow(Date.now()); });
    const offDis = onAlertDismissed((id) => setState((s) => (s.alert?.bookingId === id ? { alert: null, shownAt: null } : s)));
    return () => { offNew(); offDis(); };
  }, []);

  const active = offerAlertActive(state.alert, state.shownAt, now);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [active]);

  return active;
}
