import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

const ForceUpdateScreen = () => {
  const handleUpdateNow = () => {
    window.open(
      'https://play.google.com/store/apps/details?id=app.didisnow.worker',
      '_blank'
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
            <RefreshCw className="w-12 h-12 text-primary" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-foreground">
          Update Required
        </h1>

        {/* Message */}
        <p className="text-muted-foreground text-lg leading-relaxed">
          A new version of Didi Now Worker App is available. Please update to continue using the app.
        </p>

        {/* Update Button */}
        <Button
          onClick={handleUpdateNow}
          size="lg"
          className="w-full mt-8"
        >
          Update Now
        </Button>

        {/* Additional info */}
        <p className="text-sm text-muted-foreground mt-4">
          This update contains important improvements and bug fixes.
        </p>
      </div>
    </div>
  );
};

export default ForceUpdateScreen;
