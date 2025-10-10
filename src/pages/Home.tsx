import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { useBookingAlerts } from "@/hooks/useBookingAlerts";
import { useActiveJob } from "@/hooks/useActiveJob";
import { BookingAlertModal } from "@/components/BookingAlertModal";
import ActiveJobCard from "@/components/ActiveJobCard";
import AvailabilityToggle from "@/components/AvailabilityToggle";

export default function Home() {
  const { user } = useAuth();
  const { worker, updateAvailability, refetch: refetchWorker } = useWorkerProfile(user?.id);
  const { activeJob, updateJobStatus, refetch: refetchActiveJob } = useActiveJob(user?.id);
  const [toggling, setToggling] = useState(false);
  const [updating, setUpdating] = useState(false);
  
  const isOnline = !!worker?.is_available;

  const matches = (b:any) => {
    const inService = worker?.service_types?.includes?.(b.service_type);
    const inCommunity = (worker?.communities || [worker?.community]).includes?.(b.community);
    return !!(inService && inCommunity);
  };

  const { pending, accept, reject, clearAlert } = useBookingAlerts(user?.id, isOnline, matches);

  const handleToggle = async (value: boolean) => {
    setToggling(true);
    await updateAvailability(value);
    setToggling(false);
  };

  const handleStatusUpdate = async (status: string) => {
    setUpdating(true);
    await updateJobStatus(activeJob?.id, status);
    await refetchWorker();
    setUpdating(false);
  };

  const handleAccept = async () => {
    await accept();
    await Promise.all([refetchActiveJob(), refetchWorker()]);
  };

  return (
    <div className="p-4 space-y-4">
      <AvailabilityToggle isOnline={isOnline} onToggle={handleToggle} disabled={toggling} />
      {activeJob && <ActiveJobCard booking={activeJob} onStatusUpdate={handleStatusUpdate} updating={updating} />}
      <BookingAlertModal
        open={!!pending}
        booking={pending}
        onAccept={handleAccept}
        onReject={reject}
        onClose={clearAlert}
      />
    </div>
  );
}
