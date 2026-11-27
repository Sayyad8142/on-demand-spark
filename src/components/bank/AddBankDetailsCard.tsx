import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import { BankStatusBadge, REVIEW_MESSAGE } from "./BankStatusBadge";
import { failureReasonText, type BankDetails } from "@/lib/bankSelfService";

/** Profile/Home card from `bank_setup_status`; hidden when registered or unknown. Display only. */
export function AddBankDetailsCard({ bank, onOpen }: { bank: BankDetails | null; onOpen: () => void }) {
  useWorkerLanguage();
  const setup = bank?.setup;
  if (!setup || setup === "registered") return null;
  const isNone = setup === "none";
  const message =
    isNone ? displayText("Add your bank account so Didi Now can pay you.") :
    setup === "correction" ? displayText(failureReasonText(bank.failureReason)) :
    setup === "review" ? displayText(REVIEW_MESSAGE) :
    displayText("Bank details saved.");
  return (
    <Card className="border-0 shadow-lg overflow-hidden" data-testid="add-bank-card">
      <div className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 rounded-2xl bg-primary/15 text-primary flex items-center justify-center"><Landmark className="h-6 w-6" /></div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-base">{displayText(isNone ? "Add Bank Details" : "Bank account")}</h3>
            <BankStatusBadge setup={setup} />
          </div>
          <p className={`text-sm ${setup === "correction" ? "text-destructive" : "text-muted-foreground"}`} data-testid="add-bank-message">{message}</p>
        </div>
      </div>
      {(isNone || (setup === "correction" && bank.canEdit)) && (
        <div className="p-4 pt-3">
          <Button className="w-full h-12 rounded-xl text-base" onClick={onOpen} data-testid="add-bank-button">{displayText(isNone ? "Add Bank Details" : "Fix bank details")}</Button>
        </div>
      )}
    </Card>
  );
}
