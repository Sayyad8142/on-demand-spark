import { displayText, useWorkerLanguage } from "@/i18n/display";
import "@/i18n/notificationMessages";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BellOff, RefreshCw, Settings } from "lucide-react";
import { openNotificationSettings } from "@/lib/permissions";
import { useState } from "react";

interface Props {
  permissionGranted: boolean;
  onRetry: () => Promise<boolean> | boolean;
}

export function NotificationsOffDialog({ onRetry, permissionGranted }: Props) {
  useWorkerLanguage();
  const [retrying, setRetrying] = useState(false);

  const openSettings = async () => {
    await openNotificationSettings();
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
              {displayText(permissionGranted ? "Booking alert connection needs attention" : "Notifications are turned off")}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {displayText(permissionGranted ? "Notifications are allowed. Try again to connect booking alerts." : "Please enable notifications in your phone settings to receive booking requests.")}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {!permissionGranted && <Button size="sm" onClick={openSettings} className="flex-1">
              <Settings className="w-4 h-4 mr-2" />
              {displayText("Open Settings")}
            </Button>}
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetry}
              disabled={retrying}
              className="flex-1"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${retrying ? "animate-spin" : ""}`} />
              {retrying ? displayText("Retrying...") : displayText("Retry")}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
