import { displayText, useWorkerLanguage } from "@/i18n/display";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Landmark, Phone } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePayoutReadiness } from "@/hooks/usePayoutReadiness";
import { useState } from "react";
import { toast } from "sonner";
import { requestOwnBeneficiary } from "@/lib/bankOnboarding";
import { bankStatusFor, canSubmitBank } from "@/lib/bankSelfService";
import { BankDetailsForm } from "@/components/bank/BankDetailsForm";
import { BankStatusBadge } from "@/components/bank/BankStatusBadge";

/**
 * Bank details: form for workers with none (or failed verification) via the
 * Admin-owned `submit_my_bank_details`; status and masked details otherwise.
 * Display only — never blocks availability, offers, acceptance or completion.
 */
export default function AccountDetails() {
  useWorkerLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { readiness, loading, refetch } = usePayoutReadiness(user?.id);
  const [checking, setChecking] = useState(false);
  const status = bankStatusFor(readiness);
  const canRetryBank = !!readiness?.workerId && status === "pending";
  const retryBank = async () => {
    if (!readiness?.workerId) return;
    setChecking(true);
    try { await requestOwnBeneficiary(readiness.workerId); await refetch(); } finally { setChecking(false); }
  };
  const onSubmitted = async () => {
    toast.success(displayText("Bank details submitted. Didi Now will verify them."));
    if (readiness?.workerId) void requestOwnBeneficiary(readiness.workerId).finally(() => void refetch());
    await refetch();
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
            <div className="flex items-center gap-2 flex-wrap"><h2 className="font-semibold">{displayText("Bank account")}</h2>{status && <BankStatusBadge status={status} />}</div>
            <p className="text-sm text-muted-foreground">{displayText("Didi Now verifies your bank details before paying you.")}</p>
          </div>
        </div>

        {!loading && !readiness && <p role="status" className="text-sm text-muted-foreground">{displayText("We could not check your bank status. Please try again.")}</p>}

        {status === "failed" && <p role="alert" className="text-sm text-destructive">{displayText("We could not verify your bank account. Please check and submit again.")}</p>}

        {canSubmitBank(status) && (
          <BankDetailsForm onSubmitted={() => void onSubmitted()} />
        )}

        {(status === "pending" || status === "verified") && readiness && (
          <Card className="p-4 rounded-2xl space-y-3" data-testid="bank-status">
            {readiness.bankName && <div className="flex justify-between text-sm"><span className="text-muted-foreground">{displayText("Bank name")}</span><span className="font-medium">{readiness.bankName}</span></div>}
            {readiness.accountLast4 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">{displayText("Account")}</span><span className="font-medium tracking-wider" data-testid="bank-masked">•••• {readiness.accountLast4}</span></div>}
            <p className="text-sm">{displayText(status === "verified" ? "Your bank account is verified." : "Didi Now is verifying your bank account.")}</p>
            {canRetryBank && (
              <Button variant="outline" className="w-full h-11" disabled={checking} onClick={() => void retryBank()} data-testid="bank-recheck">
                {displayText(checking ? "Checking..." : "Check bank verification again")}
              </Button>
            )}
          </Card>
        )}

        {(status === "pending" || status === "verified") && <>
          <p className="text-sm text-muted-foreground">{displayText("To change bank details, please call Didi Now.")}</p>
          <Button className="w-full h-12 rounded-xl" asChild><a href="tel:8008180018"><Phone className="mr-2 h-4 w-4" />{displayText("Call manager")}</a></Button>
        </>}
      </main>
    </div>
  );
}
