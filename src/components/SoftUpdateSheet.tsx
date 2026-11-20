import { WorkerUpdateScreen } from "@/components/WorkerUpdateScreen";
import { displayText, useWorkerLanguage } from "@/i18n/display";

interface Props { open: boolean; onLater: () => void; storeUrl?: string }

export function SoftUpdateSheet({ open, onLater }: Props) {
  return open ? <WorkerUpdateScreen mandatory={false} onDismiss={onLater} /> : null;
}

export function UpdateAfterJobBanner() {
  useWorkerLanguage();
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[80] bg-accent px-4 py-2 text-center text-sm font-semibold text-accent-foreground shadow">
      {displayText("update_after_job")}
    </div>
  );
}
