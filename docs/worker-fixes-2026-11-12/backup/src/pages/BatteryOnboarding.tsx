import { useState } from "react";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import { BatteryCharging, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BatteryOnboardingProps {
  onFixNow: () => void | Promise<void>;
  onSkip?: () => void;
}

export default function BatteryOnboarding({ onFixNow, onSkip }: BatteryOnboardingProps) {
  useWorkerLanguage();
  const [busy, setBusy] = useState(false);

  const handleFix = async () => {
    if (busy) return; // ignore repeated taps
    setBusy(true);
    try { await onFixNow(); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-10">
      <div className="flex items-center justify-center mb-10 w-[150px] h-[150px] rounded-[40px] bg-green-50">
        <BatteryCharging className="w-24 h-24 text-green-600" strokeWidth={2} />
      </div>

      <h1 className="text-center font-bold tracking-tight text-3xl text-foreground leading-tight">
        {displayText("Give Battery Permission")}
      </h1>
      <p className="mt-3 text-center text-lg text-muted-foreground max-w-sm">
        {displayText("Battery saver can delay booking alerts.")}
      </p>
      <p className="mt-2 text-center text-base text-muted-foreground max-w-sm">
        {displayText("In Settings choose Allow or Don't optimise, then come back.")}
      </p>

      <div className="w-full max-w-sm mt-10 space-y-3">
        <Button
          size="lg"
          className="w-full h-14 text-base font-semibold rounded-xl shadow-none hover:opacity-90 text-white"
          style={{ backgroundColor: "#ff007a" }}
          onClick={handleFix}
          disabled={busy}
        >
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : displayText("Give Permission")}
        </Button>
        {onSkip && (
          <Button variant="ghost" size="lg" className="w-full h-12 text-base" onClick={onSkip}>
            {displayText("Later")}
          </Button>
        )}
      </div>
    </div>
  );
}
