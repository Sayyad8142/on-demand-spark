import { Mic } from "lucide-react";
import { useVoiceAssistant } from "@/contexts/VoiceAssistantContext";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

/**
 * Floating Voice Assistant button.
 * Bottom-right, z-[120] (sits above BottomNav z-50 and OTP reminder z-[110]).
 * Hidden when suppressed (fullscreen modals) or when there is no session.
 * Uses Didi Now pink brand color via the design token `bg-primary`.
 */
export default function VoiceAssistantFAB() {
  const { open, suppressed, openAssistant } = useVoiceAssistant();
  const { session } = useAuth();
  const { t } = useTranslation();

  if (!session?.user?.id) return null;
  if (suppressed) return null;
  if (open) return null;

  return (
    <button
      type="button"
      aria-label={t("voice.openAssistant", "Ask Didi")}
      onClick={openAssistant}
      className="fixed right-4 z-[120] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 active:scale-95 transition-transform"
      style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-25" aria-hidden />
      <Mic className="relative h-6 w-6" />
    </button>
  );
}
