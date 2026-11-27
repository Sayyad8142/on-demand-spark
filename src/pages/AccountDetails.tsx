import { displayText, useWorkerLanguage } from "@/i18n/display";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Landmark, Phone } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBankDetails } from "@/hooks/useBankDetails";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { canSubmitBank, failureReasonText, type BankDetails } from "@/lib/bankSelfService";
import { BankDetailsForm } from "@/components/bank/BankDetailsForm";
import { BankStatusBadge, REVIEW_MESSAGE } from "@/components/bank/BankStatusBadge";

/**
 * Bank details from Admin's `get_my_bank_details`; form only when the server's
 * `can_edit` allows it. Display only — never blocks any booking step.
 */
export default function AccountDetails() {
  useWorkerLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { bank, loading, refetch } = useBankDetails(user?.id);
  const status = bank?.status ?? null;
  const setup = bank?.setup ?? null;
  const onSubmitted = async (next: BankDetails | null) => {
    toast.success(displayText("Bank details saved."));
    if (next) queryClient.setQueryData(["my-bank-details", user?.id ?? "none"], next);
    await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ["payout-readiness"] })]);
  };
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => navigate(-1)} aria-label={displayText("Back")}><ArrowLeft className="h-5 w-5" /></Button>
          <h1 className="text-xl font-semibold">{displayText("Bank Details")}</h1>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 shrink-0 rounded-2xl bg-primary/15 text-primary flex items-center justify-center"><Landmark className="h-6 w-6" /></div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap"><h2 className="font-semibold">{displayText("Bank account")}</h2>{setup && <BankStatusBadge setup={setup} />}</div>
            <p className="text-sm text-muted-foreground">{displayText("Didi Now sends your payouts to this bank account.")}</p>
          </div>
        </div>

        {!loading && !bank && <div className="space-y-3"><p role="status" className="text-sm text-muted-foreground">{displayText("We could not check your bank status. Please try again.")}</p><Button variant="outline" onClick={() => void refetch()}>{displayText("Try again")}</Button></div>}

        {setup === "correction" && <p role="alert" className="text-sm text-destructive" data-testid="bank-failure-reason">{displayText(failureReasonText(bank?.failureReason ?? null))}</p>}

        {canSubmitBank(bank) && (
          <BankDetailsForm onSubmitted={(next) => void onSubmitted(next)} onBankChanged={(next) => queryClient.setQueryData(["my-bank-details", user?.id ?? "none"], next)} />
        )}

        {bank && status !== "none" && (
          <Card className="p-4 rounded-2xl space-y-3" data-testid="bank-status">
            {bank.accountHolderName && <div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">{displayText("Account holder name")}</span><span className="font-medium text-right break-words">{bank.accountHolderName}</span></div>}
            {bank.bankName && <div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">{displayText("Bank name")}</span><span className="font-medium text-right break-words">{bank.bankName}</span></div>}
            {bank.accountNumberMasked && <div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">{displayText("Account")}</span><span className="font-medium tracking-wider" data-testid="bank-masked">•••• {bank.accountNumberMasked.slice(-4)}</span></div>}
            {bank.ifsc && <div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">{displayText("IFSC code")}</span><span className="font-medium">{bank.ifsc}</span></div>}
            {setup !== "correction" && <p className="text-sm" data-testid="bank-setup-message">{displayText(setup === "registered" ? "Your bank account is registered for payouts." : setup === "review" ? REVIEW_MESSAGE : "Bank details saved.")}</p>}
          </Card>
        )}

        {bank && !canSubmitBank(bank) && status !== "none" && <>
          <p className="text-sm text-muted-foreground">{displayText("To change bank details, please call Didi Now.")}</p>
          <Button className="w-full h-12 rounded-xl" asChild><a href="tel:8008180018"><Phone className="mr-2 h-4 w-4" />{displayText("Call manager")}</a></Button>
        </>}
      </main>
    </div>
  );
}
