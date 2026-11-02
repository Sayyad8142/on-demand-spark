import { useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { displayText } from "@/i18n/display";
import { buildEmbedUrl } from "@/lib/trainingVideo";

/**
 * Official YouTube embed. Unmounting removes the iframe, which stops audio and frees the player.
 * Sound is only enabled after a worker tap (platform autoplay rules).
 */
export function HomeTrainingVideo({ videoId, onError }: { videoId: string; onError: () => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [muted, setMuted] = useState(true);
  const src = buildEmbedUrl(videoId, window.location.origin);

  const command = (func: string) =>
    ref.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*");

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-muted shadow-sm" style={{ aspectRatio: "16 / 9" }}>
      <iframe
        ref={ref}
        src={src}
        title={displayText("Training video")}
        className="absolute inset-0 h-full w-full border-0"
        allow="autoplay; encrypted-media; picture-in-picture"
        onError={onError}
      />
      {muted && (
        <button
          type="button"
          onClick={() => { command("unMute"); command("playVideo"); setMuted(false); }}
          className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-foreground shadow"
        >
          <Volume2 className="h-3.5 w-3.5" /> {displayText("Tap for sound")}
        </button>
      )}
    </div>
  );
}
