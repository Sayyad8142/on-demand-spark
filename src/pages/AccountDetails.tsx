import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, Landmark, CreditCard, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import PassbookUpload from "@/components/PassbookUpload";

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/;

export default function AccountDetails() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromSignup = searchParams.get("from") === "signup";
  const { user } = useAuth();
  const { worker, loading: workerLoading, updateWorker } = useWorkerProfile(user?.id);
  const { toast } = useToast();

  const [accountHolderName, setAccountHolderName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [upiId, setUpiId] = useState("");
  const [passbookUrl, setPassbookUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (worker) {
      const w = worker as any;
      setAccountHolderName(w.account_holder_name || "");
      setBankAccountNumber(w.bank_account_number || "");
      setConfirmAccountNumber(w.bank_account_number || "");
      setIfscCode(w.ifsc_code || "");
      setBankName(w.bank_name || "");
      setUpiId(w.upi_id || "");
      setPassbookUrl(w.passbook_url || null);
    }
  }, [worker]);

  const validate = (): string | null => {
    if (!accountHolderName.trim()) return "Account holder name is required";
    if (accountHolderName.trim().length < 2) return "Account holder name is too short";

    if (!bankAccountNumber.trim()) return "Bank account number is required";
    if (!/^\d{9,18}$/.test(bankAccountNumber.trim()))
      return "Account number must be 9–18 digits";

    if (bankAccountNumber.trim() !== confirmAccountNumber.trim())
      return "Account numbers do not match";

    if (!ifscCode.trim()) return "IFSC code is required";
    if (!IFSC_REGEX.test(ifscCode.trim().toUpperCase()))
      return "Invalid IFSC code (e.g., HDFC0001234)";

    if (upiId.trim() && !UPI_REGEX.test(upiId.trim()))
      return "Invalid UPI ID format (e.g., name@bank)";

    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      toast({ title: "Check your details", description: err, variant: "destructive" });
      return;
    }

    try {
      setSaving(true);

      const ifsc = ifscCode.trim().toUpperCase();
      const acct = bankAccountNumber.trim();
      const bankFilled = !!accountHolderName.trim() && !!acct && !!ifsc;
      const source = passbookUrl ? "passbook" : "manual";

      await updateWorker({
        account_holder_name: accountHolderName.trim(),
        bank_account_number: acct,
        ifsc_code: ifsc,
        bank_name: bankName.trim() || null,
        upi_id: upiId.trim() || null,
        passbook_url: passbookUrl,
        bank_details_source: source,
        payout_ready: bankFilled,
      } as any);

      sonnerToast.success("Account details saved");

      if (fromSignup) {
        navigate("/availability", { replace: true });
      }
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err?.message || "Could not save account details",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (workerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          {!fromSignup && (
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <h1 className="text-xl font-semibold">Account Details</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {fromSignup && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-3">
              <p className="text-sm">
                <strong>One last step!</strong> Add your bank account details so we can
                send your earnings directly. UPI is optional.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Bank Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="w-5 h-5" />
              Bank Details
              <span className="ml-auto text-xs font-normal text-destructive">
                Required
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="acct-name">Account Holder Name *</Label>
              <Input
                id="acct-name"
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                placeholder="Name as on bank account"
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="acct-no">Bank Account Number *</Label>
              <Input
                id="acct-no"
                inputMode="numeric"
                value={bankAccountNumber}
                onChange={(e) =>
                  setBankAccountNumber(e.target.value.replace(/\D/g, ""))
                }
                placeholder="9 to 18 digits"
                maxLength={18}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="acct-no-confirm">Confirm Account Number *</Label>
              <Input
                id="acct-no-confirm"
                inputMode="numeric"
                value={confirmAccountNumber}
                onChange={(e) =>
                  setConfirmAccountNumber(e.target.value.replace(/\D/g, ""))
                }
                placeholder="Re-enter account number"
                maxLength={18}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ifsc">IFSC Code *</Label>
              <Input
                id="ifsc"
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                placeholder="e.g., HDFC0001234"
                maxLength={11}
                disabled={saving}
                className="uppercase"
              />
              <p className="text-xs text-muted-foreground">
                11 characters. Format: 4 letters + 0 + 6 alphanumeric.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bank-name">Bank Name (optional)</Label>
              <Input
                id="bank-name"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g., HDFC Bank"
                disabled={saving}
              />
            </div>
          </CardContent>
        </Card>

        {/* Passbook */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="w-5 h-5" />
              Passbook Photo
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                Optional
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PassbookUpload
              workerId={worker?.id}
              currentUrl={passbookUrl}
              onUrlChange={setPassbookUrl}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Upload a clear photo of your bank passbook or cancelled cheque. This helps
              us verify your account faster.
            </p>
          </CardContent>
        </Card>

        {/* UPI */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="w-5 h-5" />
              UPI ID
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                Optional
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="upi">UPI ID (optional, saved for future use)</Label>
            <Input
              id="upi"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="e.g., name@paytm"
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              We'll save this for future use. Payouts will go to your bank account.
            </p>
          </CardContent>
        </Card>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-12 text-base font-semibold"
        >
          {saving ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Saving...
            </>
          ) : fromSignup ? (
            "Save & Continue"
          ) : (
            "Save Details"
          )}
        </Button>
      </main>
    </div>
  );
}
