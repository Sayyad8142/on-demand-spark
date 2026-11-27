import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User, Hash, Building2, KeyRound } from "lucide-react";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import { validateBankInput } from "@/lib/bankOnboarding";
import { submitMyBankDetails, SUBMIT_BANK_ERRORS, type BankDetails } from "@/lib/bankSelfService";
import { PassbookScanCard } from "./PassbookScanCard";
import { scanToForm, type PassbookFields } from "@/lib/passbookText";

/** Values live only in this component's state; never stored or logged. */
export function BankDetailsForm({ onSubmitted, onBankChanged }: { onSubmitted: (bank: BankDetails | null) => void; onBankChanged?: (bank: BankDetails) => void }) {
  useWorkerLanguage();
  const [holder, setHolder] = useState("");
  const [account, setAccount] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [bankName, setBankName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  const applyScan = (fields: PassbookFields) => {
    const result = scanToForm(fields);
    // Never replace details the worker has already typed while recognition runs.
    if (result.holder) setHolder((current) => current || result.holder);
    if (result.account) setAccount((current) => current || result.account);
    if (result.ifsc) setIfsc((current) => current || result.ifsc);
    if (result.bankName) setBankName((current) => current || result.bankName);
    setConfirmation(result.confirmation); setError(null);
  };

  const submit = async () => {
    if (saving || scanning) return;
    const input = { holder, account, confirmation, ifsc, bankName };
    const invalid = validateBankInput(input);
    if (invalid) { setError(invalid); return; }
    setError(null); setSaving(true);
    const res = await submitMyBankDetails(input);
    setSaving(false);
    if ("error" in res) {
      setError(SUBMIT_BANK_ERRORS[res.error]);
      if (res.bank) onBankChanged?.(res.bank);
      return;
    }
    setAccount(""); setConfirmation(""); onSubmitted(res.bank);
  };

  const field = (id: string, label: string, icon: JSX.Element, input: JSX.Element) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">{displayText(label)}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
        {input}
      </div>
    </div>
  );
  const cls = "h-12 rounded-xl pl-10 text-base";

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }} data-testid="bank-form" autoComplete="off">
      <PassbookScanCard onDetected={applyScan} onScanningChange={setScanning} disabled={saving} />
      {field("bank-holder", "Account holder name", <User className="h-4 w-4" />, <Input id="bank-holder" className={cls} value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={100} />)}
      {field("bank-account", "Bank account number", <Hash className="h-4 w-4" />, <Input id="bank-account" className={cls} inputMode="numeric" value={account} onChange={(e) => setAccount(e.target.value.replace(/\D/g, ""))} maxLength={18} />)}
      {field("bank-confirm", "Confirm account number", <Hash className="h-4 w-4" />, <Input id="bank-confirm" className={cls} inputMode="numeric" value={confirmation} onChange={(e) => setConfirmation(e.target.value.replace(/\D/g, ""))} maxLength={18} onPaste={(e) => e.preventDefault()} />)}
      {field("bank-ifsc", "IFSC code", <KeyRound className="h-4 w-4" />, <Input id="bank-ifsc" className={`${cls} uppercase`} value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} maxLength={11} placeholder="HDFC0001234" />)}
      {field("bank-name", "Bank name", <Building2 className="h-4 w-4" />, <Input id="bank-name" className={cls} value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={60} />)}
      {error && <p role="alert" className="text-sm text-destructive">{displayText(error)}</p>}
      <Button type="submit" className="w-full h-12 rounded-xl text-base" disabled={saving || scanning} data-testid="bank-submit">
        {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{displayText("Saving...")}</> : displayText("Submit bank details")}
      </Button>
    </form>
  );
}
