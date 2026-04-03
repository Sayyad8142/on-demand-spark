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
  currentUpiId: string;
  onSetupComplete: () => void;
}

export default function PayoutSetupCard({
  workerId,
  payoutReady,
  currentAccountName,
  currentUpiId,
  onSetupComplete,
}: PayoutSetupCardProps) {
  const [accountName, setAccountName] = useState(currentAccountName);
  const [upiId, setUpiId] = useState(currentUpiId);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!workerId) return;

    if (!accountName.trim()) {
      toast.error("Account holder name is required");
      return;
    }
    if (!upiId.trim()) {
      toast.error("UPI ID is required");
      return;
    }
    if (!/^[\w.\-]+@[\w]+$/.test(upiId.trim())) {
      toast.error("Invalid UPI ID format. Example: name@paytm");
      return;
    }

    try {
      setSaving(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in again");
        return;
      }

      const { data, error } = await supabase.functions.invoke(
        "create-worker-payout-account",
        {
          body: {
            worker_id: workerId,
            account_holder_name: accountName.trim(),
            upi_id: upiId.trim(),
          },
        }
      );

      if (error) {
        throw new Error(error.message || "Failed to set up payout");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success("Payout setup completed");
      onSetupComplete();
    } catch (err: any) {
      console.error("Payout setup error:", err);
      toast.error(err.message || "Failed to set up payout account");
    } finally {
      setSaving(false);
    }
  };

  if (payoutReady) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="w-5 h-5" />
            Payout Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-3">
            <Badge className="bg-green-100 text-green-700 gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Payout setup completed
            </Badge>
          </div>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p><span className="font-medium text-foreground">Name:</span> {currentAccountName}</p>
            <p><span className="font-medium text-foreground">UPI:</span> {currentUpiId}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="w-5 h-5" />
          Payout Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Set up your payout details to receive earnings directly via UPI.
        </p>

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
            "Save Payout Details"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
