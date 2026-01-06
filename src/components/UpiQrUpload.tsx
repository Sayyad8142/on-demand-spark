import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, QrCode, Check, X, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import jsQR from "jsqr";

interface UpiQrUploadProps {
  currentUpiId?: string;
  currentQrUrl?: string | null;
  onUpiIdExtracted: (upiId: string) => void;
  onQrDataReady?: (data: { file: File; payload: string; extractedUpiId: string }) => void;
  onQrRemoved?: () => void;
  onQrUrlSaved?: (url: string | null) => void;
  mode: "signup" | "profile";
  workerId?: string;
}

export default function UpiQrUpload({
  currentUpiId,
  currentQrUrl,
  onUpiIdExtracted,
  onQrDataReady,
  onQrRemoved,
  onQrUrlSaved,
  mode,
  workerId,
}: UpiQrUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentQrUrl || null);
  const [isSaved, setIsSaved] = useState<boolean>(!!currentQrUrl);
  const [decodedPayload, setDecodedPayload] = useState<string | null>(null);
  const [extractedUpiId, setExtractedUpiId] = useState<string | null>(null);
  const [showUpiConfirm, setShowUpiConfirm] = useState(false);
  const [pendingUpiId, setPendingUpiId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  useEffect(() => {
    setPreviewUrl(currentQrUrl || null);
    setIsSaved(!!currentQrUrl);
  }, [currentQrUrl]);

  // Extract UPI ID from QR payload
  const extractUpiIdFromPayload = (payload: string): string | null => {
    // UPI QR typically looks like: upi://pay?pa=name@bank&pn=Name&...
    const paMatch = payload.match(/[?&]pa=([^&]+)/i);
    if (paMatch) {
      return decodeURIComponent(paMatch[1]);
    }
    
    // Direct UPI ID format: name@bank
    if (/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/.test(payload)) {
      return payload;
    }
    
    return null;
  };

  // Decode QR from image file
  const decodeQrFromFile = (file: File): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        
        resolve(code?.data || null);
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Image must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      // Decode QR code
      const payload = await decodeQrFromFile(file);
      
      if (!payload) {
        toast({
          title: "Could not read QR",
          description: "Please try another image with a clearer QR code",
          variant: "destructive",
        });
        setUploading(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      const upiId = extractUpiIdFromPayload(payload);
      
      if (!upiId) {
        toast({
          title: "Not a UPI QR",
          description: "Could not find UPI ID in the QR code",
          variant: "destructive",
        });
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      // Set preview
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      setIsSaved(mode !== "profile");
      setDecodedPayload(payload);
      setExtractedUpiId(upiId);

      // For profile mode with existing worker, check if UPI differs
      if (mode === "profile" && currentUpiId && currentUpiId !== upiId) {
        setPendingUpiId(upiId);
        setPendingFile(file);
        setShowUpiConfirm(true);
        setUploading(false);
        return;
      }

      // Auto-fill UPI ID
      onUpiIdExtracted(upiId);

      // Notify parent with QR data
      if (onQrDataReady) {
        onQrDataReady({ file, payload, extractedUpiId: upiId });
      }

      // For profile mode, upload immediately
      if (mode === "profile") {
        await uploadQrToStorage(file, payload, upiId);
      } else {
        toast({
          title: "QR Scanned Successfully",
          description: `UPI ID: ${upiId}`,
        });
      }
    } catch (error: any) {
      console.error("QR processing error:", error);

      // Revert preview if save failed in profile mode (avoid false "uploaded" UI)
      if (mode === "profile") {
        setPreviewUrl(currentQrUrl || null);
        setIsSaved(!!currentQrUrl);
      }

      toast({
        title: mode === "profile" ? "Upload Failed" : "Error",
        description: error?.message || "Failed to process QR image",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const uploadQrToStorage = async (file: File, payload: string, upiId: string) => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error("Not authenticated");
    }

    // Delete old QR if exists (best-effort)
    if (currentQrUrl) {
      const oldPath = currentQrUrl.split("/worker-upi-qr/")[1];
      if (oldPath) {
        await supabase.storage.from("worker-upi-qr").remove([oldPath]);
      }
    }

    // Upload new QR
    // IMPORTANT: path must be `${auth.uid()}/...` to satisfy Storage RLS
    // Use a stable name so "Replace" overwrites instead of creating endless files.
    const filePath = `${user.id}/upi-qr.png`;

    const { error: uploadError } = await supabase.storage
      .from("worker-upi-qr")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });

    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from("worker-upi-qr").getPublicUrl(filePath);

    // Update worker profile (must persist QR metadata)
    const workerMatchId = workerId ?? user.id;
    const { error: updateError } = await supabase
      .from("workers")
      .update({
        user_id: user.id,
        upi_id: upiId,
        upi_qr_url: publicUrl,
        upi_qr_payload: payload,
        upi_qr_uploaded_at: new Date().toISOString(),
      })
      .eq("id", workerMatchId)
      .select("id")
      .single();

    if (updateError) throw updateError;

    setPreviewUrl(publicUrl);
    setIsSaved(true);
    onQrUrlSaved?.(publicUrl);

    toast({
      title: "Saved successfully",
      description: "Your UPI QR code has been saved",
    });
  };

  const handleConfirmUpiChange = async () => {
    if (!pendingUpiId || !pendingFile) return;

    try {
      setUploading(true);

      onUpiIdExtracted(pendingUpiId);

      onQrDataReady?.({
        file: pendingFile,
        payload: decodedPayload || "",
        extractedUpiId: pendingUpiId,
      });

      if (mode === "profile") {
        await uploadQrToStorage(pendingFile, decodedPayload || "", pendingUpiId);
      }

      setShowUpiConfirm(false);
      setPendingUpiId(null);
      setPendingFile(null);
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error?.message || "Failed to save QR",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleKeepExistingUpi = async () => {
    if (!pendingFile || !currentUpiId) return;

    try {
      setUploading(true);

      onQrDataReady?.({
        file: pendingFile,
        payload: decodedPayload || "",
        extractedUpiId: currentUpiId,
      });

      if (mode === "profile") {
        await uploadQrToStorage(pendingFile, decodedPayload || "", currentUpiId);
      }

      setShowUpiConfirm(false);
      setPendingUpiId(null);
      setPendingFile(null);
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error?.message || "Failed to save QR",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveQr = async () => {
    if (mode === "profile") {
      try {
        setUploading(true);

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          throw new Error("Not authenticated");
        }

        // Delete from storage (best-effort)
        if (currentQrUrl) {
          const path = currentQrUrl.split("/worker-upi-qr/")[1];
          if (path) {
            await supabase.storage.from("worker-upi-qr").remove([path]);
          }
        }

        // Update worker profile
        const workerMatchId = workerId ?? user.id;
        const { error } = await supabase
          .from("workers")
          .update({
            user_id: user.id,
            upi_qr_url: null,
            upi_qr_payload: null,
            upi_qr_uploaded_at: null,
          })
          .eq("id", workerMatchId)
          .select("id")
          .single();

        if (error) throw error;

        setPreviewUrl(null);
        setIsSaved(false);
        onQrUrlSaved?.(null);
        setDecodedPayload(null);
        setExtractedUpiId(null);

        onQrRemoved?.();

        toast({
          title: "Saved successfully",
          description: "Your UPI QR code has been removed",
        });
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to remove QR",
          variant: "destructive",
        });
      } finally {
        setUploading(false);
      }
    } else {
      // For signup mode, just clear the preview
      setPreviewUrl(null);
      setIsSaved(false);
      setDecodedPayload(null);
      setExtractedUpiId(null);
      onQrRemoved?.();
    }
  };

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        <QrCode className="h-4 w-4" />
        UPI QR Code (Optional)
      </Label>

      {/* Preview or Upload */}
      {previewUrl ? (
        <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
          <div className="flex items-center gap-3">
            <img
              src={previewUrl}
              alt="UPI QR Code"
              className="w-16 h-16 object-contain rounded-md border bg-white flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <Badge variant="secondary" className="gap-1 text-xs">
                {uploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : isSaved ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                {uploading ? "Saving..." : isSaved ? "QR Saved" : "Not saved"}
              </Badge>
              {extractedUpiId && (
                <p className="text-sm text-muted-foreground truncate mt-1">
                  {extractedUpiId}
                </p>
              )}
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
              onClick={handleRemoveQr}
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
              <p className="text-sm text-muted-foreground">Processing...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Upload QR</p>
              <p className="text-xs text-muted-foreground">
                Upload your PhonePe/GPay QR. We'll auto-detect your UPI ID.
              </p>
            </div>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* UPI ID Change Confirmation Dialog */}
      <AlertDialog open={showUpiConfirm} onOpenChange={setShowUpiConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update UPI ID?</AlertDialogTitle>
            <AlertDialogDescription>
              The QR code contains a different UPI ID:
              <br />
              <span className="font-semibold text-foreground">{pendingUpiId}</span>
              <br /><br />
              Your current UPI ID is:
              <br />
              <span className="font-semibold text-foreground">{currentUpiId}</span>
              <br /><br />
              Would you like to update to the new UPI ID?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleKeepExistingUpi}>
              Keep Existing
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmUpiChange}>
              Update to New
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}