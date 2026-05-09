import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

type State =
  | "ONLINE_HEALTHY"
  | "ONLINE_DEGRADED"
  | "OFFLINE"
  | "TOKEN_STALE"
  | "NOTIFICATION_BLOCKED"
  | "BATTERY_RESTRICTED";

const COPY: Partial<Record<State, { title: string; body: string }>> = {
  TOKEN_STALE: {
    title: "Notifications need re-registration",
    body: "Your phone hasn't refreshed its notification token recently. Open the app to fix.",
  },
  NOTIFICATION_BLOCKED: {
    title: "Notifications are blocked",
    body: "Enable notifications in Android Settings or you won't receive new bookings.",
  },
  BATTERY_RESTRICTED: {
    title: "Battery saver is blocking bookings",
    body: "Disable battery optimization for Didi Now Partner to receive bookings reliably.",
  },
};

/**
 * Phase 2 — surfaces a high-visibility banner when the worker's reachability
 * state degrades. Hides for healthy/offline/degraded states.
 */
export function ReachabilityBanner() {
  const { user } = useAuth();
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancel = false;

    const load = async () => {
      const { data } = await supabase
        .from("workers")
        .select("availability_state")
        .or(`user_id.eq.${user.id},id.eq.${user.id}`)
        .maybeSingle();
      if (!cancel) setState((data?.availability_state as State) ?? null);
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, [user?.id]);

  if (!state || !COPY[state]) return null;
  const { title, body } = COPY[state]!;

  return (
    <div className="mx-3 mt-2 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
      <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-destructive">{title}</p>
        <p className="mt-0.5 text-xs text-foreground/80">{body}</p>
        <Button asChild size="sm" variant="destructive" className="mt-2 h-8 text-xs">
          <Link to="/troubleshoot">Fix now</Link>
        </Button>
      </div>
    </div>
  );
}

export default ReachabilityBanner;
