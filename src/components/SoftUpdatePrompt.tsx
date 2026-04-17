import { Download, PhoneCall, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CURRENT_VERSION_NAME } from "@/config/version";
import type { AppUpdateConfig } from "@/hooks/useForceUpdateCheck";

interface Props {
  open: boolean;
  config: AppUpdateConfig | null;
  onRemindLater: () => void;
}

export const SoftUpdatePrompt = ({ open, config, onRemindLater }: Props) => {
  const title = config?.update_title || "Update Available";
  const message =
    config?.soft_update_message ||
    "A new version is available with improvements and bug fixes.";
  const requiredVersion = config?.latest_worker_version_name || "Latest";
  const supportPhone = config?.support_phone || "8008180018";

  const handleUpdate = () => {
    const isIOS = Capacitor.getPlatform() === "ios";
    const url = isIOS
      ? config?.ios_store_url_worker ||
        "https://play.google.com/store/apps/details?id=com.didinow.partner"
      : config?.play_store_url_worker ||
        "https://play.google.com/store/apps/details?id=com.didinow.partner";
    window.open(url, "_blank");
  };

  const handleCall = () => window.open(`tel:${supportPhone}`, "_self");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onRemindLater(); }}>
      <DialogContent className="sm:max-w-sm rounded-2xl p-0 overflow-hidden border-0">
        <div
          className="p-5 text-white"
          style={{ background: "linear-gradient(135deg, #ff007a, #ff4da6)" }}
        >
          <div className="flex items-start justify-between">
            <div className="bg-white/20 p-2 rounded-xl">
              <Download className="w-6 h-6" />
            </div>
            <button
              onClick={onRemindLater}
              className="p-1 rounded-full hover:bg-white/20"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <h2 className="text-xl font-extrabold mt-3">{title}</h2>
          <p className="text-white/90 text-sm mt-1">v{requiredVersion} is here</p>
        </div>

        <div className="p-5">
          <p className="text-gray-700 text-sm leading-relaxed mb-4">{message}</p>

          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 flex justify-between mb-4">
            <span>Your version: <b>{CURRENT_VERSION_NAME}</b></span>
            <span>Latest: <b className="text-pink-600">{requiredVersion}</b></span>
          </div>

          <button
            onClick={handleUpdate}
            className="w-full bg-pink-600 text-white font-bold rounded-xl active:scale-[0.97] transition-transform flex items-center justify-center gap-2"
            style={{ height: 50 }}
          >
            <Download className="w-5 h-5" /> Update Now
          </button>

          <button
            onClick={onRemindLater}
            className="w-full mt-2 text-gray-600 font-semibold rounded-xl border border-gray-200 active:scale-[0.97] transition-transform"
            style={{ height: 48 }}
          >
            Remind Me Later
          </button>

          <button
            onClick={handleCall}
            className="w-full mt-2 text-pink-600 font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
            style={{ height: 44 }}
          >
            <PhoneCall className="w-4 h-4" /> Call Manager
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
