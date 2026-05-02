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
import { extractBankDetailsFromPassbook } from "@/lib/bankDetailsExtraction";

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/;

const hasValidBankDetails = (name: string, accountNumber: string, ifsc: string) => (
  name.trim().length >= 2
  && /^\d{9,18}$/.test(accountNumber.trim())
  && IFSC_REGEX.test(ifsc.trim().toUpperCase())
);

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
  const [extracting, setExtracting] = useState(false);

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
    // UPI is required
    if (!upiId.trim()) return "UPI ID is required for payouts";
    if (!UPI_REGEX.test(upiId.trim()))
      return "Invalid UPI ID format (e.g., name@bank)";

    // Bank details are optional. Only validate if any bank field was filled.
    const anyBankFieldFilled = !!(
      accountHolderName.trim()
      || bankAccountNumber.trim()
      || confirmAccountNumber.trim()
      || ifscCode.trim()
      || bankName.trim()
    );

    if (!anyBankFieldFilled) return null;

    if (!accountHolderName.trim()) return "Account holder name is required when bank details are provided";
    if (accountHolderName.trim().length < 2) return "Account holder name is too short";

    if (!bankAccountNumber.trim()) return "Bank account number is required when bank details are provided";
    if (!/^\d{9,18}$/.test(bankAccountNumber.trim()))
      return "Account number must be 9–18 digits";

    if (bankAccountNumber.trim() !== confirmAccountNumber.trim())
      return "Account numbers do not match";

    if (!ifscCode.trim()) return "IFSC code is required when bank details are provided";
    if (!IFSC_REGEX.test(ifscCode.trim().toUpperCase()))
      return "Invalid IFSC code (e.g., HDFC0001234)";

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
      const bankFilled = hasValidBankDetails(accountHolderName, acct, ifsc);
      const source = passbookUrl ? "passbook" : "manual";

      // payout_ready is now driven by the DB trigger (UPI OR valid bank details).
      // We still send our best-known value for safety.
      await updateWorker({
        account_holder_name: accountHolderName.trim() || null,
        bank_account_number: acct || null,
        ifsc_code: ifsc || null,
        bank_name: bankName.trim() || null,
        upi_id: upiId.trim(),
        passbook_url: passbookUrl,
        bank_details_source: source,
        payout_ready: true,
      } as any);

      sonnerToast.success("Payout details saved");

      if (fromSignup) {
        navigate("/availability", { replace: true });
      }
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err?.message || "Could not save payout details",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePassbookUploaded = async (path: string) => {
    try {
      setExtracting(true);
      const details = await extractBankDetailsFromPassbook(path, worker?.id);
      if (!details) return;

      if (details.account_holder_name) setAccountHolderName(details.account_holder_name);
      if (details.bank_account_number) {
        setBankAccountNumber(details.bank_account_number);
        setConfirmAccountNumber(details.bank_account_number);
      }
      if (details.ifsc_code) setIfscCode(details.ifsc_code.toUpperCase());
      if (details.bank_name) setBankName(details.bank_name);

      sonnerToast.success("Bank details filled from image");
    } catch (err: any) {
      toast({
        title: "Could not read image",
        description: err?.message || "Please enter the bank details manually",
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
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
          <div>
            <h1 className="text-xl font-semibold">UPI Details</h1>
            <p className="text-xs text-muted-foreground">
              Enter UPI ID for payouts. Bank details are optional.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {fromSignup && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-3">
              <p className="text-sm">
                <strong>One last step!</strong> Enter your UPI ID so we can send
                your earnings. Bank details are optional and can be added later.
              </p>
            </CardContent>
          </Card>
        )}

        {/* UPI - REQUIRED */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="w-5 h-5" />
              UPI ID
              <span className="ml-auto text-xs font-normal text-destructive">
                Required
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="upi">UPI ID *</Label>
            <Input
              id="upi"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="e.g., name@paytm"
              disabled={saving}
              autoCapitalize="none"
              autoCorrect="off"
            />
            <p className="text-xs text-muted-foreground">
              Your earnings will be sent to this UPI ID.
            </p>
          </CardContent>
        </Card>

        {/* Bank Details - OPTIONAL */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="w-5 h-5" />
              Bank Details
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                Optional
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="acct-name">Account Holder Name</Label>
              <Input
                id="acct-name"
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                placeholder="Name as on bank account"
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="acct-no">Bank Account Number</Label>
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
              <Label htmlFor="acct-no-confirm">Confirm Account Number</Label>
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
              <Label htmlFor="ifsc">IFSC Code</Label>
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
              <Label htmlFor="bank-name">Bank Name</Label>
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

        {/* Passbook - OPTIONAL */}
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
              onUploaded={handlePassbookUploaded}
            />
            <p className="text-xs text-muted-foreground mt-2">
              {extracting
                ? "Reading bank details from the uploaded image..."
                : "Upload a clear photo of your bank passbook or cancelled cheque. We'll fill the fields when details can be read."}
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
