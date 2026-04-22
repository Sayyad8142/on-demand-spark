import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface IncompleteBankSetupProps {
  /** Optional override for the destination when the worker taps the button. */
  redirectTo?: string;
}

/**
 * Full-screen blocking page shown when a worker has not completed bank
 * account setup. Replaces the previous inline amber banner so the worker
 * cannot continue using the app until payout details are filled in.
 *
 * Source of truth for "incomplete" lives in `useBankSetupStatus`
 * (account_holder_name + bank_account_number + ifsc_code on the workers row,
 * which is exactly the same logic the OnboardingChecklist uses for the
 * "Add bank account details" step).
 */
export default function IncompleteBankSetup({
  redirectTo = "/account-details",
}: IncompleteBankSetupProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <Card className="w-full max-w-md border-2 border-destructive/40 bg-destructive/5 shadow-lg">
        <div className="p-6 space-y-5 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-9 h-9 text-destructive" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-destructive">
              Complete account setup
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              You need to update your account details before continuing. Add
              your bank account so we can pay you for completed bookings.
            </p>
          </div>

          <Button
            size="lg"
            className="w-full h-12 text-base bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            onClick={() => navigate(redirectTo)}
          >
            Update account details to proceed
          </Button>
        </div>
      </Card>
    </div>
  );
}
