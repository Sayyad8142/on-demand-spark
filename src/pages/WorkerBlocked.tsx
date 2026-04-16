import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

const ADMIN_PHONE = "8008180018";

export default function WorkerBlocked({ reason }: { reason?: string | null }) {
  const handleCall = () => {
    window.location.href = `tel:${ADMIN_PHONE}`;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-red-600 text-white px-6 text-center">
      <div className="rounded-full bg-white/20 p-6 mb-6">
        <Phone className="h-12 w-12 text-white" />
      </div>

      <h1 className="text-3xl font-bold mb-3">Account Blocked</h1>

      <p className="text-lg text-red-100 mb-2">
        Please contact admin to reactivate your account
      </p>

      {reason && (
        <p className="text-sm text-red-200 bg-red-700/40 rounded-lg px-4 py-2 mb-6 max-w-xs">
          Reason: {reason}
        </p>
      )}


      <Button
        onClick={handleCall}
        size="lg"
        className="bg-green-500 text-white hover:bg-green-600 font-bold text-lg px-8 py-6 rounded-xl shadow-lg"
      >
        <Phone className="mr-2 h-5 w-5" />
        Call Admin
      </Button>
    </div>
  );
}
