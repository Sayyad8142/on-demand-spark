import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Smartphone, Bell, CheckCircle } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { requestOverlayPermission } from "@/native/overlay";

interface PermissionsDialogProps {
  open: boolean;
  onComplete: () => void;
}

export function PermissionsDialog({ open, onComplete }: PermissionsDialogProps) {
  const [requesting, setRequesting] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  const handleAllow = async () => {
    if (!isNative) {
      onComplete();
      return;
    }

    setRequesting(true);
    try {
      // Request push notifications permission
      await PushNotifications.requestPermissions();
      
      // Request overlay permission on Android
      if (Capacitor.getPlatform() === 'android') {
        await requestOverlayPermission();
      }
    } catch (error) {
      console.error('Permission request error:', error);
    } finally {
      setRequesting(false);
      onComplete();
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md [&>button]:hidden">
        <div className="space-y-6 py-4">
          {/* Permission items */}
          <div className="space-y-6">
            {/* Device Permission */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-semibold text-base">Device Permission</h4>
                <p className="text-sm text-muted-foreground">
                  Required to keep your account active and run essential background processes smoothly.
                </p>
              </div>
            </div>

            {/* Notification Permission */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Bell className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-semibold text-base">Notification Permission</h4>
                <p className="text-sm text-muted-foreground">
                  Allow notifications so you receive booking alerts instantly and never miss an opportunity.
                </p>
              </div>
            </div>

            {/* Service Permission */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-semibold text-base">Service Availability Permission</h4>
                <p className="text-sm text-muted-foreground">
                  Enable service permission so the app can function properly when you receive a booking request.
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 justify-end pt-2">
            <Button
              variant="ghost"
              onClick={onComplete}
              disabled={requesting}
              className="text-muted-foreground"
            >
              LATER
            </Button>
            <Button
              onClick={handleAllow}
              disabled={requesting}
              className="min-w-24"
            >
              {requesting ? "Requesting..." : "ALLOW"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
