import { useCallback, useEffect, useRef, useState } from "react";
import i18n from "@/i18n/config";
import { createGuidePlayer, defaultGuideEngines, type GuideResult, type GuideState, type SpeechEngine } from "@/lib/availabilityVoice";

/** One spoken-help player per screen. Stops when the screen closes or the app goes to the background. Never plays by itself. */
export function useAvailabilityGuide(opts: { engines?: SpeechEngine[]; onResult?: (r: GuideResult) => void } = {}) {
  const [state, setState] = useState<GuideState>("idle");
  const playerRef = useRef<ReturnType<typeof createGuidePlayer> | null>(null);
  const onResultRef = useRef(opts.onResult);
  onResultRef.current = opts.onResult;
  if (!playerRef.current) playerRef.current = createGuidePlayer(opts.engines ?? defaultGuideEngines(), setState);

  useEffect(() => {
    const player = playerRef.current!;
    const onHide = () => { if (document.visibilityState === "hidden") player.stop(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      player.stop();
    };
  }, []);

  const toggle = useCallback(() => {
    void playerRef.current!.play(i18n.language).then((r) => onResultRef.current?.(r));
  }, []);

  return { state, toggle };
}
