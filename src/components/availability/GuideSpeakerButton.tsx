import { Loader2, Square, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GuideState } from "@/lib/availabilityVoice";
import { cn } from "@/lib/utils";

type Props = { state: GuideState; onPress: () => void; className?: string };

/** Speaker button for spoken instructions. Shows loading and playing states; tap while playing stops. */
export default function GuideSpeakerButton({ state, onPress, className }: Props) {
  const { t } = useTranslation();
  const label =
    state === "playing" ? t("availability.voiceStop") : state === "loading" ? t("availability.voiceLoading") : t("availability.voiceListen");
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      title={label}
      aria-pressed={state !== "idle"}
      className={cn(
        "shrink-0 h-10 w-10 rounded-full border flex items-center justify-center transition active:scale-95",
        state === "idle" ? "border-border bg-background text-foreground" : "border-primary bg-primary text-primary-foreground",
        className,
      )}
    >
      {state === "loading" ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : state === "playing" ? (
        <Square className="h-4 w-4 fill-current" />
      ) : (
        <Volume2 className="h-5 w-5" />
      )}
    </button>
  );
}
