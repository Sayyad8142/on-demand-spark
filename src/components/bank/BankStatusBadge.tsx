import { CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import type { BankSetup } from "@/lib/bankSelfService";

/** Label from Admin's `bank_setup_status` only (via `BankDetails.setup`). */
export function BankStatusBadge({ setup }: { setup: BankSetup }) {
  useWorkerLanguage();
  if (setup === "none") return null;
  const map = {
    saved: { icon: CheckCircle2, label: "Bank details saved", cls: "bg-primary/15 text-primary" },
    registered: { icon: CheckCircle2, label: "Registered", cls: "bg-success/15 text-success" },
    correction: { icon: XCircle, label: "Correction required", cls: "bg-destructive/15 text-destructive" },
    review: { icon: ShieldAlert, label: "Under review", cls: "bg-warning/15 text-warning" },
  }[setup];
  const Icon = map.icon;
  return <span data-testid="bank-status-badge" data-setup={setup} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${map.cls}`}><Icon className="h-3.5 w-3.5" />{displayText(map.label)}</span>;
}

export const REVIEW_MESSAGE = "Didi Now is doing a safety check on this bank account. Please call manager if you need help.";
