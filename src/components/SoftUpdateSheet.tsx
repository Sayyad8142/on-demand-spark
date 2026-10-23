import { Download } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import { WORKER_PLAY_STORE_URL } from "@/lib/updateDecision";

interface Props { open: boolean; onLater: () => void }

export function SoftUpdateSheet({ open, onLater }: Props) {
  useWorkerLanguage();
  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onLater(); }}>
      <DrawerContent className="min-h-[50vh] px-6 pb-8">
        <div className="mx-auto mt-6 mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Download className="h-8 w-8 text-primary" />
        </div>
        <DrawerTitle className="text-center text-2xl font-extrabold">{displayText("A New Update Is Available!")}</DrawerTitle>
        <DrawerDescription className="mt-2 text-center text-base">{displayText("soft_update_body")}</DrawerDescription>
        <div className="mt-auto space-y-3 pt-8">
          <Button size="lg" className="h-14 w-full text-base font-bold" onClick={() => window.open(WORKER_PLAY_STORE_URL, "_blank")}>
            <Download className="mr-2 h-5 w-5" /> {displayText("Update Now")}
          </Button>
          <Button size="lg" variant="outline" className="h-12 w-full" onClick={onLater}>{displayText("Later")}</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function UpdateAfterJobBanner() {
  useWorkerLanguage();
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[80] bg-accent px-4 py-2 text-center text-sm font-semibold text-accent-foreground shadow">
      {displayText("update_after_job")}
    </div>
  );
}
