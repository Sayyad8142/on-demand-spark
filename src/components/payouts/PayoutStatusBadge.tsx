import { CheckCircle2, Clock, XCircle, RotateCcw, PauseCircle, HelpCircle, Loader2, type LucideIcon } from "lucide-react";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import { PAYOUT_STATE_LABEL, type PayoutDisplayState } from "@/lib/payoutDisplay";
import { cn } from "@/lib/utils";

const STYLE: Record<PayoutDisplayState, { icon: LucideIcon; cls: string }> = {
  earned: { icon: HelpCircle, cls: "bg-muted text-muted-foreground" },
  awaiting: { icon: Clock, cls: "bg-warning/15 text-warning" },
  processing: { icon: Loader2, cls: "bg-primary/10 text-primary" },
  paid: { icon: CheckCircle2, cls: "bg-success/15 text-success" },
  on_hold: { icon: PauseCircle, cls: "bg-warning/15 text-warning" },
  failed: { icon: XCircle, cls: "bg-destructive/15 text-destructive" },
  reversed: { icon: RotateCcw, cls: "bg-destructive/15 text-destructive" },
};

export function PayoutStatusBadge({ state, className }: { state: PayoutDisplayState; className?: string }) {
  useWorkerLanguage();
  const { icon: Icon, cls } = STYLE[state];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold", cls, className)} data-state={state}>
      <Icon className="h-3.5 w-3.5" />
      {displayText(PAYOUT_STATE_LABEL[state])}
    </span>
  );
}
