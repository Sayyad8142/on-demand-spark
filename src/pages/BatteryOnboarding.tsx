import { useEffect, useRef, useState } from "react";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import { BatteryCharging, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkBatteryState } from "@/lib/permissions";
import { batteryCanContinue, isSatisfied } from "@/lib/setupGate";

interface BatteryOnboardingProps {
  onFixNow: () => void | Promise<void>;
  onContinue?: () => void;
}
export default function BatteryOnboarding({ onFixNow, onContinue }: BatteryOnboardingProps) {
  useWorkerLanguage();
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState(false);
  const attempted = useRef(false);
  useEffect(() => {
    const check = async () => {
      const state = await checkBatteryState();
      if (isSatisfied(state.status)) onContinue?.();
      else if (batteryCanContinue(state.status, attempted.current)) setFallback(true);
    };
    void check();
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", visible);
    const sub = Capacitor.isNativePlatform() ? CapApp.addListener("appStateChange", s => { if (s.isActive) void check(); }) : null;
    return () => { document.removeEventListener("visibilitychange", visible); void sub?.then(s => s.remove()); };
  }, [onContinue]);
  const handleFix = async () => {
    if (busy) return;
    setBusy(true);
    attempted.current = true;
    try {
      await onFixNow();
      const state = await checkBatteryState();
      if (isSatisfied(state.status)) onContinue?.();
      // Opening Settings alone is not a grant; fallback appears on return.
    } catch { setFallback(true); }
    finally { setBusy(false); }
  };
  return <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-10">
    <div className="flex items-center justify-center mb-10 w-[150px] h-[150px] rounded-[40px] bg-muted"><BatteryCharging className="w-24 h-24 text-primary" strokeWidth={2} /></div>
    <h1 className="text-center font-bold text-3xl text-foreground leading-tight">{displayText("Give Battery Permission")}</h1>
    <p className="mt-3 text-center text-lg text-muted-foreground max-w-sm">{displayText("Battery saver can delay booking alerts.")}</p>
    <p className="mt-2 text-center text-base text-muted-foreground max-w-sm">{displayText("In Settings choose Allow or Don't optimise, then come back.")}</p>
    <div className="w-full max-w-sm mt-10 space-y-3">
      <Button size="lg" className="w-full h-14 text-base font-semibold rounded-xl shadow-none" onClick={handleFix} disabled={busy}>{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : displayText("Give Permission")}</Button>
      {fallback && <><p role="status" className="text-center text-sm text-muted-foreground">{displayText("Your phone has not allowed the battery exemption. You can continue, but battery saver may delay alerts.")}</p><Button variant="outline" className="w-full min-h-12 h-auto py-3 whitespace-normal" onClick={onContinue}>{displayText("Continue with battery saver")}</Button></>}
    </div>
  </div>;
}
