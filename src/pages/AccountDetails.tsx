import { displayText, useWorkerLanguage } from "@/i18n/display";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Landmark, CheckCircle2, Clock, Phone } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { usePayoutReadiness } from "@/hooks/usePayoutReadiness";
import { readinessMessages } from "@/components/payouts/PayoutReadinessNotice";
import { BANK_UPDATE_CONTACT } from "@/lib/bankOnboarding";

/**
 * Bank status for registered workers, read only from Admin
 * (`get_my_payout_readiness`). Bank details are entered at registration
 * (`register_worker_v2`); there is no worker-facing bank update service yet,
 * so changes go through Didi Now. The app never writes bank fields.
 */
export default function AccountDetails() {
  useWorkerLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { worker } = useWorkerProfile(user?.id);
  const { readiness, loading } = usePayoutReadiness(user?.id, (worker as any)?.payout_ready);
  const messages = readiness ? readinessMessages(readiness) : [];
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
        {!loading && readiness && (
          <Card className="p-4 space-y-2" data-testid="bank-status">
            {readiness.ready
              ? <p className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="h-4 w-4 text-success" />{displayText("Your bank account is verified.")}</p>
              : messages.map((m) => <p key={m} className="flex items-start gap-2 text-sm"><Clock className="h-4 w-4 mt-0.5 shrink-0 text-warning" />{displayText(m)}</p>)}
          </Card>
        )}
        {!loading && !readiness && <p role="status" className="text-sm text-muted-foreground">{displayText("We could not check your bank status. Please try again.")}</p>}
        <p className="text-sm text-muted-foreground">{displayText(BANK_UPDATE_CONTACT)}</p>
        <Button className="w-full h-12" asChild><a href="tel:8008180018"><Phone className="mr-2 h-4 w-4" />{displayText("Call manager")}</a></Button>
      </main>
    </div>
  );
}
