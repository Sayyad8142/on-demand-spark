import { PhoneCall, Download, Sparkles } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import logo from "@/assets/didi-partner-logo.png";
import { CURRENT_VERSION_NAME } from "@/config/version";
import type { AppUpdateConfig } from "@/hooks/useForceUpdateCheck";

interface Props {
  config: AppUpdateConfig | null;
}

const ForceUpdateScreen = ({ config }: Props) => {
  const title = config?.update_title || "Update Required";
  const message =
    config?.user_update_message ||
    "Please update Didi Now Partner to continue receiving bookings.";
  const releaseNotes = config?.release_notes?.trim() || "";
  const requiredVersion = config?.latest_worker_version_name || "Latest";
  const supportPhone = config?.support_phone || "8008180018";

  const handleUpdateNow = () => {
    const isIOS = Capacitor.getPlatform() === "ios";
    const url = isIOS
      ? config?.ios_store_url_worker ||
        "https://play.google.com/store/apps/details?id=com.didinow.partner"
      : config?.play_store_url_worker ||
        "https://play.google.com/store/apps/details?id=com.didinow.partner";
    window.open(url, "_blank");
  };

  const handleCallManager = () => {
    window.open(`tel:${supportPhone}`, "_self");
  };

  return (
    <div
      className="min-h-screen flex flex-col px-5 py-8 overflow-y-auto"
      style={{
        background: "linear-gradient(160deg, #ff007a 0%, #ff4da6 60%, #ff80c0 100%)",
      }}
    >
      {/* Logo + Brand */}
      <div className="flex flex-col items-center mt-2 mb-6">
        <div className="bg-white rounded-2xl p-3 shadow-lg mb-3">
          <img src={logo} alt="Didi Now Partner" className="w-16 h-16 object-contain" />
        </div>
        <p className="text-white/90 text-sm font-medium tracking-wide">
          DIDI NOW PARTNER
        </p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-3xl shadow-2xl p-6 mb-5">
        <div className="flex items-center justify-center mb-4">
          <div className="bg-pink-50 p-3 rounded-full">
            <Download className="w-7 h-7 text-pink-600" />
          </div>
        </div>

        <h1 className="text-2xl font-extrabold text-gray-900 text-center mb-2">
          {title}
        </h1>
        <p className="text-gray-600 text-center text-base leading-relaxed mb-5">
          {message}
        </p>

        {/* Version info */}
        <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Your version</span>
            <span className="text-sm font-bold text-gray-800">
              {CURRENT_VERSION_NAME}
            </span>
          </div>
          <div className="h-px bg-gray-200" />
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Required version</span>
            <span className="text-sm font-bold text-pink-600">
              {requiredVersion}+
            </span>
          </div>
        </div>

        {/* Release notes */}
        {releaseNotes && (
          <div className="bg-pink-50 border border-pink-100 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-pink-600" />
              <p className="text-sm font-bold text-pink-900">What's new</p>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
              {releaseNotes}
            </p>
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="mt-auto space-y-3 pb-2">
        <button
          onClick={handleUpdateNow}
          className="w-full flex items-center justify-center gap-2 bg-white text-pink-600 font-extrabold rounded-2xl shadow-lg active:scale-[0.97] transition-transform"
          style={{ height: 58, fontSize: 17 }}
        >
          <Download className="w-5 h-5" />
          Update Now
        </button>

        <button
          onClick={handleCallManager}
          className="w-full flex items-center justify-center gap-2 font-bold rounded-2xl active:scale-[0.97] transition-transform border-2 border-white/70 text-white"
          style={{ height: 56, fontSize: 16, background: "rgba(255,255,255,0.12)" }}
        >
          <PhoneCall className="w-5 h-5" />
          Call Manager
        </button>

        <p className="text-center text-white/80 text-xs mt-2">
          Need help? Call {supportPhone}
        </p>
      </div>
    </div>
  );
};

export default ForceUpdateScreen;
