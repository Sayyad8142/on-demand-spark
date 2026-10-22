import { displayText, useWorkerLanguage, serviceLabel, bookingStatusLabel, displayLocale } from "@/i18n/display";
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
import { Button } from "@/components/ui/button";
import { openNotificationSettings } from "@/lib/permissions";
import type { SelfHelpItem } from "@/lib/workerDiagnostics";

interface Props {
  health: WorkerHealthState;
  onRepair?: () => void;
}

export function WorkerHealthBadge({ health, onRepair }: Props) {
  useWorkerLanguage();
  const navigate = useNavigate();
  const { status, reasons, loading } = health;

  if (loading && reasons.length === 0) return null;

  const config =
    status === "ready"
      ? {
          Icon: CheckCircle2,
          title: displayText("Ready for bookings"),
          tone: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900",
          iconTone: "text-emerald-600 dark:text-emerald-400",
          titleTone: "text-emerald-900 dark:text-emerald-100",
        }
      : status === "warning"
      ? {
          Icon: AlertTriangle,
          title: displayText("Needs attention"),
          tone: "bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900",
          iconTone: "text-amber-600 dark:text-amber-400",
          titleTone: "text-amber-900 dark:text-amber-100",
        }
      : {
          Icon: ShieldAlert,
          title: displayText("Cannot receive bookings"),
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
                  • {displayText(r.label)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">
              {displayText("Checks look good. Keep the app installed and notifications on.")}
            </p>
          )}
          {health.summary && <StatusRows summary={health.summary} slots={health.slots} />}
          {health.selfHelp && health.selfHelp.length > 0 && (
            <SelfHelpActions items={health.selfHelp} shown={health.summary?.messages ?? []} onRepair={onRepair} />
          )}
          {status !== "ready" && (
            <p className="mt-2 text-xs font-medium text-foreground/80">
              {displayText("Tap to")} {status === "blocked" ? displayText("fix now") : displayText("view details")} →
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function SelfHelpActions({ items, shown, onRepair }: { items: SelfHelpItem[]; shown: string[]; onRepair?: () => void }) {
  const navigate = useNavigate();
  const run = (item: SelfHelpItem) => {
    switch (item.action) {
      case "open_notification_settings": void openNotificationSettings(); break;
      case "select_slots": navigate("/availability"); break;
      case "log_in": navigate("/auth"); break;
      case "retry_registration": if (onRepair) onRepair(); else navigate("/device-readiness"); break;
      case "retry": window.location.reload(); break;
      case "check_internet": break;
    }
  };
  return (
    <div className="mt-2 space-y-1.5">
      {items.map((item) => (
        <div key={item.code} className="space-y-1">
          {!shown.includes(item.message) && <p className="text-xs text-foreground/80">{displayText(item.message)}</p>}
          {item.action === "check_internet" ? (
            <p className="text-xs font-medium text-foreground">{displayText(item.actionLabel)}</p>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={(e) => { e.stopPropagation(); run(item); }}
            >
              {displayText(item.actionLabel)}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function slotLabel(slots: WorkerHealthState["slots"]): string {
  switch (slots) {
    case "current_selected": return "Selected now";
    case "current_not_selected": return "Not selected for now";
    case "outside_hours": return "Outside working hours";
    case "none_configured": return "None selected";
    case "invalid": return "Needs fixing";
    default: return "Unknown";
  }
}

function StatusRows({ summary, slots }: { summary: NonNullable<WorkerHealthState["summary"]>; slots?: WorkerHealthState["slots"] }) {
  const rows: [string, string][] = [
    ["Availability", summary.availability === "on" ? "ON" : summary.availability === "off" ? "OFF" : "Checking"],
    ["Booking alerts", summary.alerts === "ready" ? "Ready" : summary.alerts === "attention" ? "Needs attention" : "Unknown"],
    ["Connection", summary.connection === "connected" ? "Connected" : summary.connection === "stale" ? "Last connected a while ago" : "Unknown"],
    ["Notification permission", summary.notificationPermission === "enabled" ? "Enabled" : summary.notificationPermission === "disabled" ? "Disabled" : "Unknown"],
    ["Working slots", slotLabel(slots)],
    ["Booking eligibility", summary.eligibility === "eligible" ? "Eligible" : summary.eligibility === "not_eligible" ? "Not eligible" : "Checking"],
  ];
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{displayText(k)}</dt>
          <dd className="font-medium text-foreground text-right">{displayText(v)}</dd>
        </div>
      ))}
      {summary.messages.filter((m) => m !== "Booking alerts are blocked in phone settings").map((m) => (
        <p key={m} className="col-span-2 text-foreground/80 mt-1">{displayText(m)}</p>
      ))}
    </dl>
  );
}
