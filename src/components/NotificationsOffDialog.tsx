import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BellOff, RefreshCw, Settings } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useState } from "react";

interface Props {
  onRetry: () => Promise<boolean> | boolean;
}

export function NotificationsOffDialog({ onRetry }: Props) {
  const [retrying, setRetrying] = useState(false);

  const openSettings = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        // @ts-ignore - Capacitor bridge
        const AppLauncher = (window as any).Capacitor?.Plugins?.AppLauncher;
        if (AppLauncher?.openUrl) {
          await AppLauncher.openUrl({ url: "app-settings:" });
          return;
        }
      } catch {}
    }
    try {
      window.open("app-settings:notification", "_blank");
    } catch {}
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Card className="p-5 border-2 border-destructive/40 bg-destructive/5">
      <div className="flex items-start gap-3">
        <BellOff className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="font-semibold text-base text-foreground mb-1">
              Notifications are turned off
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Please enable notifications in your phone settings to receive booking requests.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button size="sm" onClick={openSettings} className="flex-1">
              <Settings className="w-4 h-4 mr-2" />
              Open Settings
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetry}
              disabled={retrying}
              className="flex-1"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${retrying ? "animate-spin" : ""}`} />
              {retrying ? "Retrying..." : "Retry"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
