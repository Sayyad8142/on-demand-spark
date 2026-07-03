/**
 * WorkerHealthBadge — Home screen health badge.
 *
 * Shows Green / Yellow / Red status plus the top 1–3 reasons for the state.
 * Tap opens the Device Readiness page for full detail + repair actions.
 */

import { useNavigate } from "react-router-dom";
import { CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { WorkerHealthState } from "@/hooks/useWorkerHealth";
import { cn } from "@/lib/utils";

interface Props {
  health: WorkerHealthState;
  onRepair?: () => void;
}

export function WorkerHealthBadge({ health, onRepair }: Props) {
  const navigate = useNavigate();
  const { status, reasons, loading } = health;

  if (loading && reasons.length === 0) return null;

  const config =
    status === "ready"
      ? {
          Icon: CheckCircle2,
          title: "Ready for bookings",
          tone: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900",
          iconTone: "text-emerald-600 dark:text-emerald-400",
          titleTone: "text-emerald-900 dark:text-emerald-100",
        }
      : status === "warning"
      ? {
          Icon: AlertTriangle,
          title: "Needs attention",
          tone: "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900",
          iconTone: "text-amber-600 dark:text-amber-400",
          titleTone: "text-amber-900 dark:text-amber-100",
        }
      : {
          Icon: ShieldAlert,
          title: "Cannot receive bookings",
          tone: "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900",
          iconTone: "text-red-600 dark:text-red-400",
          titleTone: "text-red-900 dark:text-red-100",
        };

  const { Icon } = config;

  return (
    <Card
      className={cn("p-4 border-2 cursor-pointer transition-transform active:scale-[0.99]", config.tone)}
      onClick={() => {
        if (status === "blocked" && onRepair) {
          onRepair();
        } else {
          navigate("/device-readiness");
        }
      }}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("w-6 h-6 flex-shrink-0 mt-0.5", config.iconTone)} />
        <div className="flex-1 min-w-0">
          <h3 className={cn("font-semibold text-sm", config.titleTone)}>{config.title}</h3>
          {reasons.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {reasons.map((r) => (
                <li key={r.code} className="text-xs text-muted-foreground leading-snug">
                  • {r.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">
              Notifications, network and booking alerts are all working.
            </p>
          )}
          {status !== "ready" && (
            <p className="mt-2 text-xs font-medium text-foreground/80">
              Tap to {status === "blocked" ? "fix now" : "view details"} →
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
