import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, BookOpen, Check, Loader2, Trash2, FileText } from "lucide-react";

interface PassbookUploadProps {
  workerId?: string;
  currentUrl?: string | null;
  onUrlChange: (url: string | null) => void;
}

const BUCKET = "worker-passbook";
const MAX_SIZE = 8 * 1024 * 1024; // 8MB
const ACCEPTED = "image/jpeg,image/png,image/webp,application/pdf";

export default function PassbookUpload({
  workerId,
  currentUrl,
  onUrlChange,
}: PassbookUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl || null);
  const [isPdf, setIsPdf] = useState<boolean>(!!currentUrl?.toLowerCase().endsWith(".pdf"));

  useEffect(() => {
    setPreviewUrl(currentUrl || null);
    setIsPdf(!!currentUrl?.toLowerCase().endsWith(".pdf"));
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

      // Remove old file (best-effort)
      if (currentUrl) {
        const oldPath = currentUrl.split(`/${BUCKET}/`)[1];
        if (oldPath) {
          await supabase.storage.from(BUCKET).remove([oldPath]);
        }
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

      // Bucket is private — use a signed URL for preview, but persist storage path
      // via a public-style URL form so we can re-derive the path. We store the
      // signed URL for immediate viewing; persistence happens via parent onUrlChange.
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 days

      const finalUrl = signed?.signedUrl || filePath;

      setPreviewUrl(finalUrl);
      setIsPdf(file.type === "application/pdf");
      onUrlChange(finalUrl);

      toast({
        title: "Passbook uploaded",
        description: "Your passbook image has been saved",
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
      if (currentUrl) {
        const path = currentUrl.split(`/${BUCKET}/`)[1]?.split("?")[0];
        if (path) {
          await supabase.storage.from(BUCKET).remove([path]);
        }
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

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        <BookOpen className="h-4 w-4" />
        Passbook / Cancelled Cheque (Optional)
      </Label>

      {previewUrl ? (
        <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
          <div className="flex items-center gap-3">
            {isPdf ? (
              <div className="w-16 h-16 rounded-md border bg-white flex items-center justify-center flex-shrink-0">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
            ) : (
              <img
                src={previewUrl}
                alt="Passbook"
                className="w-16 h-16 object-cover rounded-md border bg-white flex-shrink-0"
              />
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
