import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Dialog from "@radix-ui/react-dialog";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Download, Loader2, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import { logAppHealth } from "@/lib/appHealthLog";
import { openWorkerStore } from "@/lib/workerStore";
import illustration from "@/assets/worker-update-illustration.png.asset.json";

export function WorkerUpdateScreen({ mandatory, onDismiss }: { mandatory: boolean; onDismiss?: () => void }) {
  useWorkerLanguage();
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);
  const locked = useRef(false);
  const surface = useRef<HTMLDivElement>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    let disposed = false;
    let remove: (() => void) | undefined;
    void App.addListener("backButton", () => {
      if (!mandatory) dismiss.current?.();
    }).then(h => {
      if (disposed) void h.remove();
      else remove = () => { void h.remove(); };
    }).catch(() => { /* listener unavailable: close control remains available for optional updates */ });
    return () => { disposed = true; remove?.(); };
  }, [mandatory]);

  const openStore = async () => {
    if (locked.current) return;
    locked.current = true;
    setOpening(true);
    setFailed(false);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    surface.current?.focus({ preventScroll: true });
    logAppHealth("update_tapped", mandatory ? "force" : "soft");
    try { await openWorkerStore(); }
    catch { setFailed(true); }
    finally { locked.current = false; setOpening(false); }
  };

  return (
    <Dialog.Root open onOpenChange={open => { if (!open && !mandatory) onDismiss?.(); }}>
      <Dialog.Portal>
        <Dialog.Content ref={surface} className={`worker-update-screen${mandatory ? ' worker-update-mandatory' : ''}`} aria-describedby={undefined} onOpenAutoFocus={e => { e.preventDefault(); surface.current?.focus({ preventScroll: true }); }}
          onEscapeKeyDown={e => { if (mandatory) e.preventDefault(); }}
          onPointerDownOutside={e => e.preventDefault()}>
          {!mandatory && <header className="worker-update-header">
            <span className="text-base font-bold text-primary">Didi Now Partner</span>
            {!mandatory && <Button type="button" size="icon" variant="ghost" className="rounded-full text-muted-foreground"
              aria-label={displayText("Close")} title={displayText("Close")} onClick={onDismiss}><X /></Button>}
          </header>}
          <div className="worker-update-content">
            {mandatory ? <div className="worker-update-download" aria-hidden="true"><Download strokeWidth={1.8} /></div> :
              <img src={Capacitor.isNativePlatform() ? new URL(illustration.url, "https://partner.didisnow.com").href : illustration.url} alt={t("updateScreen.illustration")}
                className="worker-update-illustration" loading="eager" />}
            <div className="worker-update-copy">
              <Dialog.Title className="worker-update-title">{mandatory ? displayText('App Update Required') : t("updateScreen.title")}</Dialog.Title>
              {!mandatory && <Dialog.Description id="worker-update-description" className="worker-update-description">
                {t("updateScreen.body")}
              </Dialog.Description>}
            </div>
          </div>
          <footer className="worker-update-footer">
            {failed && <p role="alert" className="mb-3 text-center text-sm text-destructive">{t("updateScreen.error")}</p>}
            <Button type="button" size="lg" variant={mandatory ? 'bookingStart' : 'default'} className="worker-update-button w-full rounded-2xl text-base font-bold" disabled={opening}
              aria-busy={opening} onClick={() => void openStore()}>
              {opening ? <Loader2 className="motion-safe:animate-spin" /> : <Download />}
              {displayText("Update Now")}
            </Button>
            {mandatory && <Button asChild size="icon" variant="bookingStart" className="worker-update-phone rounded-full">
              <a href="tel:8008180018" aria-label={displayText('Call Support')} title={displayText('Call Support')}><Phone aria-hidden="true" /></a>
            </Button>}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}