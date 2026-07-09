import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type AssistantMode = "chat" | "booking_offer" | "briefing" | "summary" | "coach" | "active_job";

export type BookingOfferPayload = {
  bookingId: string;
  custName?: string;
  community?: string;
  serviceType?: string;
  flatNo?: string;
  priceInr?: number;
};

type OpenOptions = { mode?: AssistantMode; booking?: BookingOfferPayload; seed?: string };

type VoiceAssistantState = {
  open: boolean;
  suppressed: boolean;
  mode: AssistantMode;
  booking: BookingOfferPayload | null;
  seed: string | null;
  openAssistant: (opts?: OpenOptions) => void;
  closeAssistant: () => void;
  setSuppressed: (v: boolean) => void;
};

const Ctx = createContext<VoiceAssistantState | null>(null);

export function VoiceAssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [suppressed, setSuppressed] = useState(false);
  const [mode, setMode] = useState<AssistantMode>("chat");
  const [booking, setBooking] = useState<BookingOfferPayload | null>(null);
  const [seed, setSeed] = useState<string | null>(null);

  const openAssistant = useCallback((opts?: OpenOptions) => {
    setMode(opts?.mode ?? "chat");
    setBooking(opts?.booking ?? null);
    setSeed(opts?.seed ?? null);
    setOpen(true);
  }, []);
  const closeAssistant = useCallback(() => {
    setOpen(false);
    setBooking(null);
    setSeed(null);
    setMode("chat");
  }, []);

  const value = useMemo(
    () => ({ open, suppressed, mode, booking, seed, openAssistant, closeAssistant, setSuppressed }),
    [open, suppressed, mode, booking, seed, openAssistant, closeAssistant],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVoiceAssistant() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVoiceAssistant must be used inside VoiceAssistantProvider");
  return v;
}
