import { displayText, useWorkerLanguage, serviceLabel, bookingStatusLabel, displayLocale } from "@/i18n/display";
import { useState } from "react";
import { Loader2, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BundleInfo, downloadAndApplyUpdate } from "@/lib/liveUpdate";

interface Props {
  bundleInfo: BundleInfo;
}

export function OtaMandatoryModal({ bundleInfo }: Props) {
  useWorkerLanguage();
  const [status, setStatus] = useState<string>("A required update is available");
  const [updating, setUpdating] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleUpdate = async () => {
    setUpdating(true);
    setFailed(false);
    const success = await downloadAndApplyUpdate(bundleInfo, setStatus);
    if (!success) {
      setFailed(true);
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80">
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 mx-6 max-w-sm w-full text-center shadow-2xl">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
          {updating ? (
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          ) : (
            <Download className="w-8 h-8 text-primary" />
          )}
        </div>

        <h2 className="text-xl font-bold mb-2">{displayText("Update Required")}</h2>
        <p className="text-sm text-muted-foreground mb-1">
          {displayText("Version")} {bundleInfo.version}
        </p>
        {bundleInfo.message && (
          <p className="text-sm text-muted-foreground mb-4">{bundleInfo.message}</p>
        )}
        <p className="text-sm font-medium mb-6">{status}</p>

        <Button
          onClick={handleUpdate}
          disabled={updating}
          className="w-full"
          size="lg"
        >
          {updating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {displayText("Updating...")}
            </>
          ) : failed ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              {displayText("Retry Update")}
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              {displayText("Update Now")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
