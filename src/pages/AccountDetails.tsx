import { displayText, useWorkerLanguage } from "@/i18n/display";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Landmark } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BANK_SERVICE_UNAVAILABLE, SECURE_BANK_ONBOARDING_ENABLED, readCollectWorkerUpi, submitSecureBankDetails, validateBankInput } from "@/lib/bankOnboarding";

export default function AccountDetails() {
  useWorkerLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [holder, setHolder] = useState("");
  const [account, setAccount] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [upi, setUpi] = useState("");
  const [collectUpi, setCollectUpi] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void readCollectWorkerUpi().then(value => { if (!cancelled) setCollectUpi(value); });
    return () => { cancelled = true; };
  }, []);
  const save = async () => {
    const error = validateBankInput({ holder, account, confirmation, ifsc });
    if (error) { toast({ title: displayText("Check your details"), description: displayText(error), variant: "destructive" }); return; }
    try { await submitSecureBankDetails(); }
    catch { toast({ title: displayText(BANK_SERVICE_UNAVAILABLE), variant: "destructive" }); }
  };
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="bg-card border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label={displayText("Back")}><ArrowLeft className="h-5 w-5" /></Button>
          <h1 className="text-xl font-semibold">{displayText("Bank Details")}</h1>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        <div className="flex items-start gap-3"><Landmark className="h-6 w-6 shrink-0 text-primary" /><div><h2 className="font-semibold">{displayText("Bank account required for bookings")}</h2><p className="text-sm text-muted-foreground">{displayText("Bank details are verified by Didi Now before bookings")}</p></div></div>
        <div className="space-y-2"><Label htmlFor="acct-name">{displayText("Account Holder Name")}</Label><Input id="acct-name" value={holder} onChange={e => setHolder(e.target.value)} autoComplete="off" /></div>
        <div className="space-y-2"><Label htmlFor="acct-no">{displayText("Bank Account Number")}</Label><Input id="acct-no" inputMode="numeric" maxLength={18} value={account} onChange={e => setAccount(e.target.value.replace(/\D/g, ""))} autoComplete="off" /></div>
        <div className="space-y-2"><Label htmlFor="acct-no-confirm">{displayText("Confirm Account Number")}</Label><Input id="acct-no-confirm" inputMode="numeric" maxLength={18} value={confirmation} onChange={e => setConfirmation(e.target.value.replace(/\D/g, ""))} autoComplete="off" /></div>
        <div className="space-y-2"><Label htmlFor="ifsc">IFSC</Label><Input id="ifsc" maxLength={11} value={ifsc} onChange={e => setIfsc(e.target.value.toUpperCase())} autoComplete="off" /></div>
        {collectUpi && <div className="space-y-2"><Label htmlFor="upi">UPI ID · {displayText("Optional")}</Label><Input id="upi" value={upi} onChange={e => setUpi(e.target.value)} autoCapitalize="none" /></div>}
        <p role="status" className="text-sm text-muted-foreground">{displayText(BANK_SERVICE_UNAVAILABLE)}</p>
        <Button className="w-full h-12" disabled={!SECURE_BANK_ONBOARDING_ENABLED} onClick={save}>{displayText("Save Details")}</Button>
        <Button variant="outline" className="w-full" asChild><a href="tel:8008180018">{displayText("Call manager")}</a></Button>
      </main>
    </div>
  );
}
