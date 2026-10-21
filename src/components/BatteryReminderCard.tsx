import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { BatteryWarning } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import { checkBatteryState, requestBatteryExemption } from "@/lib/permissions";

/** Small, non-blocking reminder shown on Home while battery saver is still on. */
export function BatteryReminderCard() {
  useWorkerLanguage();
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await checkBatteryState();
      setMissing(s.status === "missing");
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
    refresh();
    const sub = CapApp.addListener("appStateChange", ({ isActive }) => { if (isActive) setTimeout(refresh, 700); });
    return () => { sub.then((s) => s.remove()); };
  }, [refresh]);

  if (!missing) return null;

  return (
    <Card className="p-4 flex items-center gap-3 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
      <BatteryWarning className="w-6 h-6 text-amber-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground">{displayText("Battery saver is on")}</p>
        <p className="text-xs text-muted-foreground">{displayText("Battery saver can delay booking alerts.")}</p>
      </div>
      <Button
        size="sm"
        className="h-11 px-4"
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          try { await requestBatteryExemption(); } finally { setBusy(false); }
        }}
      >
        {displayText("Fix now")}
      </Button>
    </Card>
  );
}
