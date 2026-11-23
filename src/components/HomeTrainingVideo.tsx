import { useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { displayText } from "@/i18n/display";
import { buildEmbedUrl } from "@/lib/trainingVideo";
import { Button } from "@/components/ui/button";

/**
 * Official YouTube embed. Unmounting removes the iframe, which stops audio and frees the player.
 * Sound is only enabled after a worker tap (platform autoplay rules).
 */
export function HomeTrainingVideo({ videoId, format = "landscape", onError }: { videoId: string; format?: "shorts" | "landscape"; onError: () => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [muted, setMuted] = useState(true);
  const src = buildEmbedUrl(videoId, window.location.origin);

  const command = (func: string) =>
    ref.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*");

  return (
    <div className={`relative mx-auto w-full overflow-hidden rounded-2xl bg-muted shadow-sm ${format === "shorts" ? "aspect-[9/16] max-w-[min(100%,360px,calc(70svh*9/16))]" : "aspect-video"}`}>
      <iframe
        ref={ref}
        src={src}
        title={displayText("Training video")}
        className="absolute inset-0 h-full w-full border-0"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        onError={onError}
      />
      {muted && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => { command("unMute"); command("playVideo"); setMuted(false); }}
          className="absolute right-2 top-2 h-9 gap-1 rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-foreground shadow"
        >
          <Volume2 className="h-3.5 w-3.5" /> {displayText("Tap for sound")}
        </Button>
      )}
    </div>
  );
}
