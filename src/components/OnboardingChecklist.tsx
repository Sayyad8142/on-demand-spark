import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Circle, ChevronRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { getBankSetupStatus } from "@/lib/bankSetup";

interface OnboardingChecklistProps {
  workerId: string;
  worker: any;
  onStatusChange?: (complete: boolean) => void;
}

export interface OnboardingStatus {
  hasServiceTypes: boolean;
  hasCommunity: boolean;
  hasAvailabilitySlots: boolean;
  hasBankDetails: boolean;
  isComplete: boolean;
}

export function useOnboardingStatus(workerId: string | undefined, worker: any): OnboardingStatus {
  const [hasSlots, setHasSlots] = useState(true); // optimistic default

  useEffect(() => {
    if (!workerId) return;
    supabase
      .from("worker_availability")
      .select("id")
      .eq("worker_id", workerId)
      .limit(1)
      .then(({ data }) => {
        setHasSlots(!!(data && data.length > 0));
      });
  }, [workerId]);

  const hasServiceTypes = !!(worker?.service_types && worker.service_types.length > 0);
  const hasCommunity = !!(worker?.selected_community_id || (worker?.communities && worker.communities.length > 0));
  const hasBankDetails = getBankSetupStatus(worker).hasBankDetails;

  return {
    hasServiceTypes,
    hasCommunity,
    hasAvailabilitySlots: hasSlots,
    hasBankDetails,
    isComplete: hasServiceTypes && hasCommunity && hasSlots && hasBankDetails,
  };
}

export function OnboardingChecklist({ workerId, worker, onStatusChange }: OnboardingChecklistProps) {
  const navigate = useNavigate();
  const status = useOnboardingStatus(workerId, worker);

  useEffect(() => {
    onStatusChange?.(status.isComplete);
  }, [status.isComplete, onStatusChange]);

  // If complete, don't show anything — worker is ready
  if (status.isComplete) return null;

  const steps = [
    {
      label: "Select your services",
      done: status.hasServiceTypes,
      action: () => navigate("/profile"),
    },
    {
      label: "Select your area",
      done: status.hasCommunity,
      action: () => navigate("/profile"),
    },
    {
      label: "Add bank account details",
      done: status.hasBankDetails,
      action: () => navigate("/account-details"),
    },
    {
      label: "Set your working hours",
      done: status.hasAvailabilitySlots,
      action: () => navigate("/availability"),
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;

  return (
    <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700">
      <div className="space-y-3">
        <div>
          <h3 className="font-bold text-sm text-blue-900 dark:text-blue-100">
            Complete setup to receive bookings
          </h3>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
            {completedCount}/{steps.length} steps done
          </p>
        </div>

        <div className="space-y-2">
          {steps.map((step, i) => (
            <button
              key={i}
              onClick={step.done ? undefined : step.action}
              disabled={step.done}
              className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors ${
                step.done
                  ? "bg-green-100 dark:bg-green-900/30"
                  : "bg-white dark:bg-blue-900 hover:bg-blue-100 dark:hover:bg-blue-800 cursor-pointer"
              }`}
            >
              {step.done ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-blue-400 flex-shrink-0" />
              )}
              <span
                className={`text-sm flex-1 ${
                  step.done
                    ? "text-green-700 dark:text-green-300 line-through"
                    : "text-blue-900 dark:text-blue-100 font-medium"
                }`}
              >
                {step.label}
              </span>
              {!step.done && <ChevronRight className="w-4 h-4 text-blue-400" />}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
