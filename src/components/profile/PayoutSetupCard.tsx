import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wallet, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface PayoutSetupCardProps {
  workerId: string | undefined;
  payoutReady: boolean;
  currentAccountName: string;
  currentBankAccountNumber?: string;
  currentIfscCode?: string;
  currentUpiId: string;
  onSetupComplete: () => void;
}

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export default function PayoutSetupCard({
  workerId,
  payoutReady,
  currentAccountName,
  currentBankAccountNumber = "",
  currentIfscCode = "",
  currentUpiId,
  onSetupComplete,
}: PayoutSetupCardProps) {
  const [accountName, setAccountName] = useState(currentAccountName);
  const [bankAccountNumber, setBankAccountNumber] = useState(currentBankAccountNumber);
  const [ifscCode, setIfscCode] = useState(currentIfscCode);
  const [upiId, setUpiId] = useState(currentUpiId);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!workerId) return;

    if (!accountName.trim()) {
      toast.error("Account holder name is required");
      return;
    }
    if (!/^\d{9,18}$/.test(bankAccountNumber.trim())) {
      toast.error("Account number must be 9–18 digits");
      return;
    }
    if (!IFSC_REGEX.test(ifscCode.trim().toUpperCase())) {
      toast.error("Invalid IFSC code. Example: HDFC0001234");
      return;
    }
    if (upiId.trim() && !upiId.includes("@")) {
      toast.error("Invalid UPI ID. It must contain '@'. Example: name@paytm");
      return;
    }

    try {
      setSaving(true);

      const bankReady = !!accountName.trim() && /^\d{9,18}$/.test(bankAccountNumber.trim()) && IFSC_REGEX.test(ifscCode.trim().toUpperCase());

      const { error } = await supabase
        .from("workers")
        .update({
          account_holder_name: accountName.trim(),
          bank_account_number: bankAccountNumber.trim(),
          ifsc_code: ifscCode.trim().toUpperCase(),
          upi_id: upiId.trim() || null,
          payout_ready: bankReady,
        })
        .eq("id", workerId);

      if (error) throw error;

      toast.success("Payout details saved successfully");
      onSetupComplete();
    } catch (err: any) {
      console.error("Payout save error:", err);
      toast.error(err.message || "Failed to save payout details");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="w-5 h-5" />
          Payout Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {payoutReady && (
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-green-100 text-green-700 gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Payout details saved
            </Badge>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="payout-name">Account Holder Name</Label>
          <Input
            id="payout-name"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Your full name"
            disabled={saving}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="payout-upi">UPI ID</Label>
          <Input
            id="payout-upi"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            placeholder="e.g., name@paytm"
            disabled={saving}
          />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Details"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
