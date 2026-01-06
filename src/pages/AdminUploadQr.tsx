import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload, CheckCircle } from "lucide-react";

export default function AdminUploadQr() {
  const { toast } = useToast();
  const [workerId, setWorkerId] = useState("");
  const [upiId, setUpiId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleUpload = async () => {
    if (!workerId || !file) {
      toast({
        title: "Missing fields",
        description: "Please enter worker ID and select a file",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const imageBase64 = await base64Promise;

      // Call edge function
      const { data, error } = await supabase.functions.invoke("admin-upload-qr", {
        body: {
          workerId,
          imageBase64,
          upiId: upiId || undefined,
        },
      });

      if (error) {
        throw error;
      }

      setResult(data);
      toast({
        title: "Upload Successful",
        description: `QR uploaded for ${data.workerName}`,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload Failed",
        description: error.message || JSON.stringify(error),
        variant: "destructive",
      });
      setResult({ error: error.message || error });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Admin: Upload Worker QR</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workerId">Worker ID (UUID)</Label>
              <Input
                id="workerId"
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                placeholder="8e03deed-3742-4aa0-9496-f540f771f82a"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="upiId">UPI ID (optional)</Label>
              <Input
                id="upiId"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="name@bank"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="qrFile">QR Code Image</Label>
              <Input
                id="qrFile"
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>

            <Button
              onClick={handleUpload}
              disabled={uploading || !workerId || !file}
              className="w-full"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload QR
                </>
              )}
            </Button>

            {result && (
              <div className="mt-4 p-3 rounded-lg bg-muted text-sm">
                {result.success ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span>Uploaded for {result.workerName}</span>
                  </div>
                ) : (
                  <pre className="text-destructive whitespace-pre-wrap">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                )}
                {result.publicUrl && (
                  <div className="mt-2">
                    <a
                      href={result.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline text-xs break-all"
                    >
                      {result.publicUrl}
                    </a>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          Worker ID for Sid (7894896396): 8e03deed-3742-4aa0-9496-f540f771f82a
        </p>
      </div>
    </div>
  );
}
