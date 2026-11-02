import { useEffect, useState } from "react";
import { useBookingOfferVisible } from "@/hooks/useBookingOfferVisible";
import { useHomeTrainingVideo } from "@/hooks/useHomeTrainingVideo";
import { HomeTrainingVideo } from "@/components/HomeTrainingVideo";
import { TRAINING_VIDEO_CLIENT_ENABLED, shouldShowTrainingVideo } from "@/lib/trainingVideo";

/** Renders nothing (no box, no loader) unless every visibility rule passes. */
export function HomeTrainingVideoSlot({ isGuest, hasActiveJob, hasWorker }: { isGuest: boolean; hasActiveJob: boolean; hasWorker: boolean }) {
  const offerVisible = useBookingOfferVisible();
  const eligible = TRAINING_VIDEO_CLIENT_ENABLED && hasWorker && !isGuest && !hasActiveJob;
  const { config, foreground } = useHomeTrainingVideo(eligible);
  const [errorId, setErrorId] = useState<string | null>(null);
  useEffect(() => { if (config?.videoId !== errorId) setErrorId(null); }, [config?.videoId]); // eslint-disable-line

  const show = hasWorker && shouldShowTrainingVideo({
    clientEnabled: TRAINING_VIDEO_CLIENT_ENABLED,
    config, isGuest, hasActiveJob, offerVisible,
    appForeground: foreground,
    playerError: !!config && errorId === config.videoId,
  });
  if (!show || !config) return null;
  return <HomeTrainingVideo key={config.videoId} videoId={config.videoId} onError={() => setErrorId(config.videoId)} />;
}
