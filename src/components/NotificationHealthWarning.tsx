import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { triggerManualPushRepair } from "@/services/pushRepairCoordinator";
import { ensurePushPermission } from "@/lib/pushToken";
import { toast } from "@/hooks/use-toast";

// @ts-ignore Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

type Issue =
  | "token_missing"
  | "token_invalid"
  | "notifications_disabled"
  | "overlay_disabled";

const ISSUE_LABEL: Record<Issue, string> = {
  token_missing: "Notification token missing",
  token_invalid: "Notification token expired",
  notifications_disabled: "Notifications turned off",
  overlay_disabled: "Booking popup not allowed",
};

/**
 * NotificationHealthWarning
 *
 * Hard guard for booking-receipt readiness. Shown on Home whenever any of:
 *   - fcm_token missing / invalid in workers row
 *   - POST_NOTIFICATIONS permission denied
 *   - SYSTEM_ALERT_WINDOW (overlay) permission denied
 *
 * "Fix Notifications" runs a one-tap self-heal:
 *   1. request notification permission
 *   2. trigger forced FCM token refresh + backend sync (logs to token_repair_events)
 *   3. re-check overlay permission
 */
export function NotificationHealthWarning() {
  const { user } = useAuth();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [fixing, setFixing] = useState(false);
  const [justFixed, setJustFixed] = useState(false);

  const evaluate = useCallback(async () => {
    if (!user?.id) return;
    const next: Issue[] = [];

    // Backend token state
    try {
      const { data: w } = await supabase
        .from("workers")
        .select("fcm_token, fcm_token_status")
        .or(`user_id.eq.${user.id},id.eq.${user.id}`)
        .maybeSingle();
      if (!w?.fcm_token) next.push("token_missing");
      else if (w.fcm_token_status === "invalid" || w.fcm_token_status === "expired") next.push("token_invalid");
    } catch {/* ignore */}

    // Notification permission
    try {
      const granted = await ensurePushPermission("health-warning", { requestIfMissing: false });
      if (!granted) next.push("notifications_disabled");
    } catch {/* ignore */}

    // Overlay permission (native only)
    if (Capacitor.isNativePlatform() && AuthBridge?.getDeviceContext) {
      try {
        const ctx = await AuthBridge.getDeviceContext();
        if (ctx && ctx.overlay_granted === false) next.push("overlay_disabled");
      } catch {/* optional */}
    }

    setIssues(next);
    if (next.length === 0 && justFixed) {
      setTimeout(() => setJustFixed(false), 4000);
    }
  }, [user?.id, justFixed]);

  useEffect(() => {
    if (!user?.id) return;
    evaluate();
    const id = setInterval(evaluate, 60_000);
    return () => clearInterval(id);
  }, [user?.id, evaluate]);

  const handleFix = useCallback(async () => {
    if (!user?.id) return;
    setFixing(true);
    try {
      // 1. Permission
      await ensurePushPermission("manual-fix", { requestIfMissing: true });

      // 2. Force token refresh + backend sync (writes to workers + token_repair_events via heartbeat)
      const ok = await triggerManualPushRepair(user.id, "notification-warning-fix");

      // 3. Re-evaluate
      await evaluate();

      if (ok) {
        setJustFixed(true);
        toast({
          title: "Notifications fixed",
          description: "You'll now receive booking alerts. Open Settings if any switch is still off.",
        });
      } else {
        toast({
          title: "Couldn't fully fix",
          description: "Please open Android Settings and enable notifications & display over other apps.",
          variant: "destructive",
        });
      }
    } finally {
      setFixing(false);
    }
  }, [user?.id, evaluate]);

  if (justFixed && issues.length === 0) {
    return (
      <div className="mx-3 mt-2 flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-3">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        <p className="text-sm font-medium text-green-700">Notifications working — you'll receive new bookings.</p>
      </div>
    );
  }

  if (issues.length === 0) return null;

  return (
    <div className="mx-3 mt-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-destructive">
            Booking notifications are not working properly.
          </p>
          <p className="mt-0.5 text-xs text-foreground/80">
            Please tap Fix Now to restore them.
          </p>
          <ul className="mt-1.5 ml-4 list-disc text-xs text-foreground/70">
            {issues.map((i) => (
              <li key={i}>{ISSUE_LABEL[i]}</li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="destructive"
            className="mt-2 h-8 text-xs"
            disabled={fixing}
            onClick={handleFix}
          >
            {fixing ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Fixing…
              </>
            ) : (
              "Fix Notifications"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default NotificationHealthWarning;
