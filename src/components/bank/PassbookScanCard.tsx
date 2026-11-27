import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, Loader2, ScanLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { displayText, useWorkerLanguage } from "@/i18n/display";
import { hasNativePassbookScanner, scanPassbook, type PassbookSource } from "@/lib/passbookScan";
import { countPassbookFields, PASSBOOK_FIELD_COUNT, type PassbookFields } from "@/lib/passbookText";

export function PassbookScanCard({ onDetected, onScanningChange, disabled = false }: {
  onDetected: (fields: PassbookFields) => void;
  onScanningChange: (scanning: boolean) => void;
  disabled?: boolean;
}) {
  useWorkerLanguage();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<{ text: string; values?: Record<string, number>; success: boolean } | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const scan = async (source: PassbookSource, file?: File) => {
    if (busy.current || disabled) return;
    busy.current = true;
    const task = new AbortController();
    controller.current = task;
    setScanning(true); onScanningChange(true); setMessage(null);
    try {
      const fields = await scanPassbook(source, file, task.signal);
      if (task.signal.aborted) return;
      // Every readable field is filled on its own; failure is shown only when nothing was read.
      const count = countPassbookFields(fields);
      if (count) onDetected(fields);
      setMessage(count === PASSBOOK_FIELD_COUNT
        ? { success: true, text: "All 4 bank details detected. Please check them and type the account number again." }
        : count
          ? { success: true, text: "{{found}} of 4 bank details detected. Please complete the remaining details.", values: { found: count } }
          : { success: false, text: "No bank details could be read. Retake a clear photo or enter the details manually." });
    } catch (error: unknown) {
      if (task.signal.aborted) return;
      const code = error && typeof error === "object" && "message" in error ? String(error.message) : "";
      if (code !== "cancelled") setMessage({ success: false, text: code === "invalid_image"
        ? "Choose a photo smaller than 12 MB, or enter the details manually."
        : "Could not scan this photo. Retake it or enter the details manually." });
    } finally {
      busy.current = false;
      if (!task.signal.aborted) { setScanning(false); onScanningChange(false); }
    }
  };
  const choose = (source: PassbookSource) => {
    if (disabled || busy.current) return;
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
        <h2 className="text-base font-semibold">{displayText("Scan Passbook / Cheque")}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{displayText("Use a clear photo of your passbook account page or a cheque.")}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="min-h-12 h-auto py-2 whitespace-normal" disabled={scanning || disabled} onClick={() => choose("camera")}><Camera className="mr-2 h-4 w-4 shrink-0" />{displayText("Take Photo")}</Button>
        <Button type="button" variant="outline" className="min-h-12 h-auto py-2 whitespace-normal" disabled={scanning || disabled} onClick={() => choose("gallery")}><ImagePlus className="mr-2 h-4 w-4 shrink-0" />{displayText("Upload from Gallery")}</Button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" aria-label={displayText("Take Photo")} onChange={(e) => picked(e.currentTarget, "camera")} />
      <input ref={gallery} type="file" accept="image/*" className="hidden" aria-label={displayText("Upload from Gallery")} onChange={(e) => picked(e.currentTarget, "gallery")} />
      {scanning && <p role="status" className="flex items-center gap-2 text-sm text-primary"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />{displayText("Scanning photo...")}</p>}
      {message && (
        <p role="status" className={message.success ? "flex gap-2 rounded-md border border-success/40 bg-success/10 p-2 text-sm font-medium text-foreground" : "text-sm text-muted-foreground"}>
          {message.success && <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-success" />}
          {displayText(message.text, message.values)}
        </p>
      )}
      <p className="flex gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0" />{displayText("Your photo stays on this device and is not uploaded.")}</p>
    </Card>
  );
}