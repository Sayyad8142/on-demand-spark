import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type VoiceAssistantState = {
  open: boolean;
  suppressed: boolean; // hides FAB entirely (fullscreen modals, blocked worker, etc.)
  openAssistant: () => void;
  closeAssistant: () => void;
  setSuppressed: (v: boolean) => void;
};

const Ctx = createContext<VoiceAssistantState | null>(null);

export function VoiceAssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [suppressed, setSuppressed] = useState(false);

  const openAssistant = useCallback(() => setOpen(true), []);
  const closeAssistant = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, suppressed, openAssistant, closeAssistant, setSuppressed }),
    [open, suppressed, openAssistant, closeAssistant],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVoiceAssistant() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVoiceAssistant must be used inside VoiceAssistantProvider");
  return v;
}
