/**
 * DemoModeBanner - Displays a prominent banner when user is in guest/demo mode
 * 
 * This banner appears at the top of main screens (Home, Bookings, Profile)
 * to clearly indicate that the user is in demo mode and no real data is affected.
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

export function DemoModeBanner() {
  return (
    <Alert className="mb-4 border-primary bg-primary/10">
      <Info className="h-4 w-4" />
      <AlertTitle className="font-semibold">Demo Mode Enabled</AlertTitle>
      <AlertDescription className="text-sm">
        You are using Didi Now Worker in Guest/Demo Mode. This environment is for testing only and does not affect real bookings or earnings.
      </AlertDescription>
    </Alert>
  );
}
