import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, BookOpen, Check, Loader2, Trash2, FileText } from "lucide-react";

interface PassbookUploadProps {
  workerId?: string;
  /** Storage path stored in DB (e.g. `<uid>/passbook-123.jpg`). */
  currentUrl?: string | null;
  /** Receives the storage path (not a signed URL) to persist. */
  onUrlChange: (path: string | null) => void;
  /** Called immediately after a new upload succeeds. */
  onUploaded?: (path: string) => void | Promise<void>;
}

const BUCKET = "worker-passbook";
const MAX_SIZE = 8 * 1024 * 1024; // 8MB
const ACCEPTED = "image/jpeg,image/png,image/webp,application/pdf";
const SIGNED_URL_TTL = 60 * 60; // 1 hour — refreshed on each mount

/**
 * Treat the value as a storage path unless it clearly looks like a full URL.
 * Legacy rows may still contain a signed URL — extract the path from those.
 */
function extractStoragePath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return value; // already a path
  const marker = `/${BUCKET}/`;
  const idx = value.indexOf(marker);
  if (idx === -1) return null;
  return value.slice(idx + marker.length).split("?")[0];
}

export default function PassbookUpload({
  workerId,
  currentUrl,
  onUrlChange,
  onUploaded,
}: PassbookUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState<boolean>(false);

  // Resolve a fresh signed URL from the stored path whenever the path changes.
  useEffect(() => {
    let cancelled = false;
    const path = extractStoragePath(currentUrl);

    if (!path) {
      setPreviewUrl(null);
      setIsPdf(false);
      return;
    }

    setIsPdf(path.toLowerCase().endsWith(".pdf"));

    (async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL);
      if (cancelled) return;
      if (error || !data?.signedUrl) {
        console.warn("Failed to sign passbook URL", error);
        setPreviewUrl(null);
        return;
      }
      setPreviewUrl(data.signedUrl);
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUrl]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED.split(",").includes(file.type)) {
      toast({
        title: "Invalid file",
        description: "Please upload a JPG, PNG, WEBP, or PDF",
        variant: "destructive",
      });
      return;
    }

    if (file.size > MAX_SIZE) {
      toast({
        title: "File too large",
        description: "Max size is 8MB",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("Not authenticated");
      }

      // Remove old file (best-effort) using stored path
      const oldPath = extractStoragePath(currentUrl);
      if (oldPath) {
        await supabase.storage.from(BUCKET).remove([oldPath]);
      }

      const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1] || "jpg";
      // Path MUST start with auth.uid() to satisfy RLS
      const filePath = `${user.id}/passbook-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        throw new Error(uploadError.message || "Upload failed");
      }

      // Persist ONLY the storage path. UI preview uses a fresh signed URL.
      onUrlChange(filePath);
      await onUploaded?.(filePath);

      // Generate signed URL for immediate preview
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(filePath, SIGNED_URL_TTL);
      setPreviewUrl(signed?.signedUrl || null);
      setIsPdf(file.type === "application/pdf");

      toast({
        title: "Account image uploaded",
        description: "We'll read the account details from it when possible",
      });
    } catch (err: any) {
      console.error("Passbook upload error:", err);
      toast({
        title: "Upload failed",
        description: err?.message || "Could not upload passbook",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    try {
      setUploading(true);
      const path = extractStoragePath(currentUrl);
      if (path) {
        await supabase.storage.from(BUCKET).remove([path]);
      }
      setPreviewUrl(null);
      setIsPdf(false);
      onUrlChange(null);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to remove passbook",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const hasPassbook = !!extractStoragePath(currentUrl);

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        <BookOpen className="h-4 w-4" />
        Passbook / Cancelled Cheque (Optional)
      </Label>

      {hasPassbook ? (
        <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
          <div className="flex items-center gap-3">
            {isPdf ? (
              <div className="w-16 h-16 rounded-md border bg-white flex items-center justify-center flex-shrink-0">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt="Passbook"
                className="w-16 h-16 object-cover rounded-md border bg-white flex-shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-md border bg-white flex items-center justify-center flex-shrink-0">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <Badge variant="secondary" className="gap-1 text-xs">
                <Check className="h-3 w-3" />
                Passbook saved
              </Badge>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {isPdf ? "PDF document" : "Image uploaded"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex-1"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Upload className="h-3 w-3 mr-1.5" />
                  Replace
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRemove}
              disabled={uploading}
              className="flex-1 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3 w-3 mr-1.5" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
          className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Upload Passbook</p>
              <p className="text-xs text-muted-foreground">
                Photo of bank passbook or cancelled cheque (JPG, PNG, PDF)
              </p>
            </div>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED}
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
