import { Download, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/didi-partner-logo.png";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import { WORKER_PLAY_STORE_URL } from "@/lib/updateDecision";

interface Props { installedBuild: number; minBuild: number | null; storeUrl?: string }

const SUPPORT_PHONE = "8008180018";

const ForceUpdateScreen = ({ installedBuild, minBuild, storeUrl = WORKER_PLAY_STORE_URL }: Props) => {
  useWorkerLanguage();
  return (
    <div className="flex min-h-screen flex-col bg-background px-6 py-10">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <img src={logo} alt="Didi Now Partner" className="mb-6 h-20 w-20 object-contain" />
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Download className="h-8 w-8 text-primary" />
        </div>
        <h1 className="mb-3 text-3xl font-extrabold text-foreground">{displayText("Update Required")}</h1>
        <p className="mb-6 max-w-sm text-base text-muted-foreground">{displayText("force_update_body")}</p>
        <div className="w-full max-w-sm space-y-2 rounded-xl bg-muted p-4 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">{displayText("Installed build")}</span><b>{installedBuild}</b></div>
          {minBuild !== null && <div className="flex justify-between"><span className="text-muted-foreground">{displayText("Required build")}</span><b className="text-primary">{minBuild}+</b></div>}
        </div>
      </div>
      <div className="space-y-3">
        <Button size="lg" className="h-14 w-full text-base font-extrabold" onClick={() => window.open(storeUrl, "_blank")}>
          <Download className="mr-2 h-5 w-5" /> {displayText("Update Now")}
        </Button>
        <a href={`tel:${SUPPORT_PHONE}`} className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <PhoneCall className="h-4 w-4" /> {displayText("Need help? Call")} {SUPPORT_PHONE}
        </a>
      </div>
    </div>
  );
};

export default ForceUpdateScreen;
