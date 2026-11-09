import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayText, useWorkerLanguage } from "@/i18n/display";

export function PayoutLoadError({ onRetry, hasData }: { onRetry: () => void; hasData: boolean }) {
  useWorkerLanguage();
  return (
    <div role="alert" className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
      <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
      <p className="flex-1 text-sm text-destructive">
        {hasData ? displayText("Couldn't refresh earnings. Showing last loaded amounts.") : displayText("Couldn't load earnings. Check your internet and try again.")}
      </p>
      <Button size="sm" variant="outline" onClick={onRetry} className="gap-1">
        <RefreshCw className="h-3.5 w-3.5" />
        {displayText("Retry")}
      </Button>
    </div>
  );
}
