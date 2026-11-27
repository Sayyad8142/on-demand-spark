import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import type { BankStatus } from "@/lib/bankSelfService";

export function BankStatusBadge({ status }: { status: BankStatus }) {
  useWorkerLanguage();
  if (status === "none") return null;
  const map = {
    pending: { icon: Clock, label: "Pending", cls: "bg-warning/15 text-warning" },
    verified: { icon: CheckCircle2, label: "Verified", cls: "bg-success/15 text-success" },
    failed: { icon: XCircle, label: "Verification Failed", cls: "bg-destructive/15 text-destructive" },
  }[status];
  const Icon = map.icon;
  return <span data-testid="bank-status-badge" className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${map.cls}`}><Icon className="h-3.5 w-3.5" />{displayText(map.label)}</span>;
}
