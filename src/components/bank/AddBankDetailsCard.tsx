import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import { BankStatusBadge } from "./BankStatusBadge";
import type { BankStatus } from "@/lib/bankSelfService";

/** Profile card: invite to add bank (none) or show pending/failed status; hidden when verified or unknown. */
export function AddBankDetailsCard({ status, onOpen }: { status: BankStatus | null; onOpen: () => void }) {
  useWorkerLanguage();
  if (!status || status === "verified") return null;
  const isNone = status === "none";
  return (
    <Card className="border-0 shadow-lg overflow-hidden" data-testid="add-bank-card">
      <div className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 rounded-2xl bg-primary/15 text-primary flex items-center justify-center"><Landmark className="h-6 w-6" /></div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-base">{displayText(isNone ? "Add Bank Details" : "Bank account")}</h3>
            <BankStatusBadge status={status} />
          </div>
          <p className="text-sm text-muted-foreground">{displayText(
            isNone ? "Add your bank account so Didi Now can pay you." :
            status === "failed" ? "We could not verify your bank account. Please check and submit again." :
            "Didi Now is verifying your bank account.")}</p>
        </div>
      </div>
      {(isNone || status === "failed") && (
        <div className="p-4 pt-3">
          <Button className="w-full h-12 rounded-xl text-base" onClick={onOpen} data-testid="add-bank-button">{displayText(isNone ? "Add Bank Details" : "Fix bank details")}</Button>
        </div>
      )}
    </Card>
  );
}
