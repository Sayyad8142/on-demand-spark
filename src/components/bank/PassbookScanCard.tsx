import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, ScanLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import { hasNativePassbookScanner, scanPassbook, type PassbookSource } from "@/lib/passbookScan";
import type { PassbookFields } from "@/lib/passbookText";

export function PassbookScanCard({ onDetected, onScanningChange }: {
  onDetected: (fields: PassbookFields) => void;
  onScanningChange: (scanning: boolean) => void;
}) {
  useWorkerLanguage();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => () => controller.current?.abort(), []);

  const scan = async (source: PassbookSource, file?: File) => {
    if (busy.current) return;
    busy.current = true;
    const task = new AbortController();
    controller.current = task;
    setScanning(true); onScanningChange(true); setMessage("");
    try {
      const fields = await scanPassbook(source, file, task.signal);
      if (task.signal.aborted) return;
      const count = Object.values(fields).filter(Boolean).length;
      if (count) onDetected(fields);
      setMessage(count === 4
        ? "Review the details and type the account number again. Scanning is not bank verification."
        : "Some details could not be read. Retake a clear photo or enter the missing details manually.");
    } catch (error: unknown) {
      if (task.signal.aborted) return;
      const code = error && typeof error === "object" && "message" in error ? String(error.message) : "";
      if (code !== "cancelled") setMessage(code === "invalid_image"
        ? "Choose a photo smaller than 12 MB, or enter the details manually."
        : "Could not scan this photo. Retake it or enter the details manually.");
    } finally {
      busy.current = false;
      if (!task.signal.aborted) { setScanning(false); onScanningChange(false); }
    }
  };
  const choose = (source: PassbookSource) => {
    if (hasNativePassbookScanner()) void scan(source);
    else (source === "camera" ? camera : gallery).current?.click();
  };
  const picked = (input: HTMLInputElement, source: PassbookSource) => {
    const file = input.files?.[0];
    input.value = ""; // Never retain the selected image in the file control.
    if (file) void scan(source, file);
  };

  return (
    <Card className="rounded-lg border-primary/20 bg-primary/5 p-4 space-y-3" aria-busy={scanning}>
      <div className="flex items-center gap-3">
        <ScanLine className="h-7 w-7 shrink-0 text-primary" />
        <h2 className="text-base font-semibold">{displayText("Upload Bank Passbook")}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{displayText("Use a clear photo of the account details page.")}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="min-h-12 h-auto py-2 whitespace-normal" disabled={scanning} onClick={() => choose("camera")}><Camera className="mr-2 h-4 w-4 shrink-0" />{displayText("Take Photo")}</Button>
        <Button type="button" variant="outline" className="min-h-12 h-auto py-2 whitespace-normal" disabled={scanning} onClick={() => choose("gallery")}><ImagePlus className="mr-2 h-4 w-4 shrink-0" />{displayText("Upload from Gallery")}</Button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" aria-label={displayText("Take Photo")} onChange={(e) => picked(e.currentTarget, "camera")} />
      <input ref={gallery} type="file" accept="image/*" className="hidden" aria-label={displayText("Upload from Gallery")} onChange={(e) => picked(e.currentTarget, "gallery")} />
      {scanning && <p role="status" className="flex items-center gap-2 text-sm text-primary"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />{displayText("Scanning photo...")}</p>}
      {message && <p role="status" className="text-sm text-muted-foreground">{displayText(message)}</p>}
      <p className="flex gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0" />{displayText("Your photo stays on this device and is not uploaded.")}</p>
    </Card>
  );
}