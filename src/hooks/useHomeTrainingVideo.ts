import { useCallback, useEffect, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import {
  TRAINING_VIDEO_CLIENT_ENABLED,
  TRAINING_VIDEO_REFRESH_MS,
  TRAINING_VIDEO_TABLE,
  parseTrainingVideoRow,
  type TrainingVideoConfig,
} from "@/lib/trainingVideo";

/** Read-only: fetches the published training video config. Any error → null (hidden). */
export function useHomeTrainingVideo(active: boolean) {
  const [config, setConfig] = useState<TrainingVideoConfig | null>(null);
  const [foreground, setForeground] = useState(
    typeof document === "undefined" ? true : document.visibilityState !== "hidden",
  );

  const load = useCallback(async () => {
    if (!TRAINING_VIDEO_CLIENT_ENABLED) { setConfig(null); return; }
    try {
      const { data, error } = await (supabase as any)
        .from(TRAINING_VIDEO_TABLE)
        .select("enabled, youtube_video_id")
        .limit(1)
        .maybeSingle();
      const next = error ? null : parseTrainingVideoRow(data);
      setConfig((prev) => (prev?.videoId === next?.videoId && !!prev === !!next ? prev : next));
    } catch {
      setConfig(null);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    load();
    const t = setInterval(load, TRAINING_VIDEO_REFRESH_MS);
    return () => clearInterval(t);
  }, [active, load]);

  useEffect(() => {
    const onVis = () => {
      const fg = document.visibilityState !== "hidden";
      setForeground(fg);
      if (fg && active) load();
    };
    document.addEventListener("visibilitychange", onVis);
    let sub: { remove: () => void } | null = null;
    CapApp.addListener("appStateChange", ({ isActive }) => {
      setForeground(isActive);
      if (isActive && active) load();
    }).then((s) => { sub = s; }).catch(() => {});
    return () => { document.removeEventListener("visibilitychange", onVis); sub?.remove(); };
  }, [active, load]);

  return { config, foreground };
}
