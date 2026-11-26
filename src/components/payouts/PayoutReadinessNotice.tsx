import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import type { PayoutReadiness } from "@/lib/payoutBookingGate";

/** Server-reported next step only; never decides readiness itself. */
export function readinessMessages(readiness: PayoutReadiness | null): string[] {
  if (!readiness) return ["We could not check your bank status. Please try again."];
  const out: string[] = [];
  if (!readiness.hasBankDetails) out.push("Add your bank account to start getting bookings.");
  else if (!readiness.beneficiaryRegistered) out.push("Didi Now is verifying your bank account. Bookings start after verification.");
  if (!readiness.adminApproved) out.push("Waiting for Didi Now approval.");
  return out;
}

export function PayoutReadinessNotice({ readiness, onBankDetails }: { readiness: PayoutReadiness | null; onBankDetails: () => void }) {
  useWorkerLanguage();
  const messages = readinessMessages(readiness);
  if (messages.length === 0) return null;
  return (
    <Card className="p-4 border-2 border-primary/30 bg-primary/5 shadow-sm" data-testid="payout-readiness-notice">
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="font-semibold text-base text-foreground">{displayText("Bank account required for bookings")}</h2>
            {messages.map((m) => <p key={m} className="text-sm text-muted-foreground leading-relaxed">{displayText(m)}</p>)}
          </div>
        </div>
        {readiness && !readiness.hasBankDetails && (
          <Button className="w-full h-11" onClick={onBankDetails}>{displayText("Bank Details")}</Button>
        )}
      </div>
    </Card>
  );
}
